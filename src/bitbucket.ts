import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { compactArray, uuid } from "./utils";

interface Config {
  username: string;
  password: string;
  workspace: string;
}

export interface PullRequest {
  [key: string]: string | number | Date | null;
  id: number;
  title: string;
  author: string;
  comment_count: number;
  task_count: number;
  created_on: Date;
  updated_on: Date;
  first_commit_on: Date;
}

export interface Activity {
  [key: string]: string | number | Date | null;
  uuid: string;
  type: string | "comment" | "approval" | "merged" | "open" | "declined";
  date: Date;
  user_id: string;
  pull_request_id: number;
}

export interface User {
  [key: string]: string;
  uuid: string;
  account_id: string;
  nickname: string;
  display_name: string;
}

interface RawMember {
  type: "workspace_membership" | string;
  user: RawUser;
}

interface RawUser {
  uuid: string;
  nickname: string;
  display_name: string;
  account_id: string;
}

interface RawApprovalPayload {
  date: string;
  user: RawUser;
}

interface RawCommentPayload {
  created_on: string;
  user: RawUser;
}

interface RawUpdatePayload {
  state: "MERGED" | "OPEN" | "DECLINED";
  date: string;
  author: RawUser;
}

interface RawChangeRequestPayload {
  date: string;
  user: RawUser;
}

interface RawActivity {
  pull_request: {
    id: number;
  };
  approval?: RawApprovalPayload;
  comment?: RawCommentPayload;
  update?: RawUpdatePayload;
  changes_requested?: RawChangeRequestPayload;
}

interface RawApprovalActivity extends RawActivity {
  approval: RawApprovalPayload;
}
interface RawCommentActivity extends RawActivity {
  comment: RawCommentPayload;
}
interface RawUpdateActivity extends RawActivity {
  update: RawUpdatePayload;
}
interface RawChangeRequestActivity extends RawActivity {
  changes_requested: RawChangeRequestPayload;
}

function isApproval(activity: RawActivity): activity is RawApprovalActivity {
  return !!activity.approval;
}
function isComment(activity: RawActivity): activity is RawCommentActivity {
  return !!activity.comment;
}
function isUpdate(activity: RawActivity): activity is RawUpdateActivity {
  return !!activity.update;
}
function isChangeRequest(
  activity: RawActivity
): activity is RawChangeRequestActivity {
  return !!activity.changes_requested;
}

interface RawCommit {
  date: string;
  author: RawUser;
}

interface RawPullRequest {
  id: number;
  title: string;
  comment_count: number;
  task_count: number;
  author: RawUser;
  created_on: string;
  updated_on: string;
}

interface RawPullRequest {
  id: number;
  title: string;
  comment_count: number;
  task_count: number;
  closed_by: RawUser | null;
  author: RawUser;
  created_on: string;
  updated_on: string;
}

interface ListResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  values: T[];
}

async function fetchFirstCommit(
  config: Config,
  repoSlug: string,
  pullRequestId: number
): Promise<string | null> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: { username: config.username, password: config.password },
  });

  let nextPageLink: string | undefined;
  do {
    const url =
      nextPageLink ||
      `/repositories/${config.workspace}/${repoSlug}/pullrequests/${pullRequestId}/commits`;
    const response = await apiClient.get<ListResponse<RawCommit>>(url, {
      params: { pagelen: 100 },
    });

    if (!nextPageLink) {
      const commits = response.data.values;
      return commits[commits.length - 1].date;
    }
  } while (!!nextPageLink);

  return null;
}

export async function fetchUsers(config: Config): Promise<User[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: { username: config.username, password: config.password },
  });

  const userList: User[] = [];

  let nextPageLink: string | undefined;
  do {
    console.log(`Fetching users`);
    const url = nextPageLink || `/workspaces/${config.workspace}/members`;
    const response = await apiClient.get<ListResponse<RawMember>>(url);

    console.log(`Fetched ${response.data.values.length} users`);

    const users: User[] = response.data.values
      .filter((member) => member.type === "workspace_membership")
      .map((member) => member.user)
      .map(({ uuid, nickname, display_name, account_id }) => {
        return {
          uuid,
          nickname,
          display_name,
          account_id,
        };
      });

    userList.push(...users);
  } while (!!nextPageLink);

  return userList;
}

export async function fetchPullRequests(
  config: Config,
  repoSlug: string,
  state: "OPEN" | "MERGED" | "DECLINED",
  updated_since: Dayjs
): Promise<PullRequest[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: { username: config.username, password: config.password },
  });

  const pullRequestList: PullRequest[] = [];

  let nextPageLink: string | undefined;
  do {
    console.log(`Fetching '${state}' pull requests for ${repoSlug}`);
    const url =
      nextPageLink ||
      `/repositories/${config.workspace}/${repoSlug}/pullrequests`;
    const response = await apiClient.get<ListResponse<RawPullRequest>>(url, {
      params: {
        state,
        pagelen: 50,
        q: `updated_on >= ${updated_since.toISOString()}`,
      },
    });

    console.log(
      `Fetched ${response.data.values.length} '${state}' pull requests for ${repoSlug}`
    );

    const pullRequests: PullRequest[] = await Promise.all(
      response.data.values.map(
        async ({
          id,
          title,
          comment_count,
          task_count,
          author,
          created_on,
          updated_on,
        }) => {
          const first_commit_on = await fetchFirstCommit(config, repoSlug, id);

          return {
            id,
            title,
            comment_count,
            task_count,
            author: author.uuid,
            created_on: dayjs(created_on).toDate(),
            updated_on: dayjs(updated_on).toDate(),
            first_commit_on: dayjs(first_commit_on).toDate(),
          };
        }
      )
    );

    pullRequestList.push(...pullRequests);
  } while (!!nextPageLink);

  return pullRequestList;
}

export async function fetchPullRequestActivities(
  config: Config,
  repoSlug: string,
  pullRequestId: number
): Promise<Activity[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: { username: config.username, password: config.password },
  });

  const activityList: Activity[] = [];

  let nextPageLink: string | undefined;
  do {
    console.log(`Fetching activities for ${repoSlug}`);
    const url =
      nextPageLink ||
      `/repositories/${config.workspace}/${repoSlug}/pullrequests/${pullRequestId}/activity`;
    const response = await apiClient.get<ListResponse<RawActivity>>(url);

    console.log(
      `Fetched ${response.data.values.length} activities for ${repoSlug}`
    );

    const activities: Activity[] = compactArray(
      response.data.values.map((rawActivity) => {
        if (isApproval(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-approval-${rawActivity.approval.date}`
            ),
            type: "approval",
            date: dayjs(rawActivity.approval.date).toDate(),
            user_id: rawActivity.approval.user.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else if (isComment(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-comment-${rawActivity.comment.created_on}`
            ),
            type: "comment",
            date: dayjs(rawActivity.comment.created_on).toDate(),
            user_id: rawActivity.comment.user.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else if (isUpdate(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-${rawActivity.update.state}-${rawActivity.update.date}`
            ),
            type: rawActivity.update.state.toLowerCase(),
            date: dayjs(rawActivity.update.date).toDate(),
            user_id: rawActivity.update.author.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else if (isChangeRequest(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-changeRequest-${rawActivity.changes_requested.date}`
            ),
            type: "changeRequest",
            date: dayjs(rawActivity.changes_requested.date).toDate(),
            user_id: rawActivity.changes_requested.user.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else {
          console.warn(`Unknown activity: ${JSON.stringify(rawActivity)}`);
          return null;
        }
      })
    );

    activityList.push(...activities);

    nextPageLink = response.data.next;
  } while (!!nextPageLink);

  return activityList;
}
