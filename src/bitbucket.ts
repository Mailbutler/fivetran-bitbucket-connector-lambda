import axios from "axios";
import { Dayjs } from "dayjs";
import { uuid } from "./utils";

interface Config {
  username: string;
  password: string;
  workspace: string;
}

export interface PullRequest {
  [key: string]: string | number | null;
  id: number;
  title: string;
  author: string;
  comment_count: number;
  task_count: number;
  created_on: string;
  updated_on: string;
  first_commit_on: string | null;
}

export interface Activity {
  [key: string]: string | number | null;
  uuid: string;
  type: "comment" | "approval" | "update";
  date: string;
  user_id: string;
  pull_request_id: number;
}

export interface User {
  uuid: string;
  account_id: string;
  nickname: string;
  display_name: string;
}

interface RawUser {
  uuid: string;
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

interface RawActivity {
  pull_request: {
    id: number;
  };
  approval?: RawApprovalPayload;
  comment?: RawCommentPayload;
  update?: RawUpdatePayload;
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

function isApproval(activity: RawActivity): activity is RawApprovalActivity {
  return !!activity.approval;
}
function isComment(activity: RawActivity): activity is RawCommentActivity {
  return !!activity.comment;
}
function isUpdate(activity: RawActivity): activity is RawUpdateActivity {
  return !!activity.update;
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
    try {
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
    } catch (error) {
      console.error("An error occurred:", error);
      return null;
    }
  } while (!!nextPageLink);

  return null;
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
    try {
      const url =
        nextPageLink ||
        `/repositories/${config.workspace}/${repoSlug}/pullrequests`;
      const response = await apiClient.get<ListResponse<RawPullRequest>>(url, {
        params: {
          state,
          pagelen: 100,
          q: `updated_on >= ${updated_since.toISOString()}`,
        },
      });

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
            const first_commit_on = await fetchFirstCommit(
              config,
              repoSlug,
              id
            );

            return {
              id,
              title,
              comment_count,
              task_count,
              author: author.uuid,
              created_on,
              updated_on,
              first_commit_on,
            };
          }
        )
      );

      pullRequestList.push(...pullRequests);
    } catch (error) {
      console.error("An error occurred:", error);
      break;
    }
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
    try {
      const url =
        nextPageLink ||
        `/repositories/${config.workspace}/${repoSlug}/pullrequests/${pullRequestId}/activity`;
      const response = await apiClient.get<ListResponse<RawActivity>>(url);

      const activities: Activity[] = response.data.values.map((rawActivity) => {
        if (isApproval(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-approval-${rawActivity.approval.date}`
            ),
            type: "approval",
            date: rawActivity.approval.date,
            user_id: rawActivity.approval.user.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else if (isComment(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-comment-${rawActivity.comment.created_on}`
            ),
            type: "comment",
            date: rawActivity.comment.created_on,
            user_id: rawActivity.comment.user.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else if (isUpdate(rawActivity)) {
          return {
            uuid: uuid(
              `${rawActivity.pull_request.id}-update-${rawActivity.update.date}`
            ),
            type: "comment",
            date: rawActivity.update.date,
            user_id: rawActivity.update.author.uuid,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else {
          throw new Error(`Unknown activity: ${JSON.stringify(rawActivity)}`);
        }
      });

      activityList.push(...activities);

      nextPageLink = response.data.next;
    } catch (error) {
      console.error("An error occurred:", error);
      break;
    }
  } while (!!nextPageLink);

  return activityList;
}
