import axios from "axios";
import dayjs, { Dayjs } from "dayjs";
import { compactArray, uuid } from "./utils";

interface Credentials {
  username: string;
  password: string;
}

export interface PullRequest {
  [key: string]: string | number | Date | null;
  repository: string;
  id: number;
  url: string;
  title: string;
  author: string;
  state: string;
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
  repository: string;
  pull_request_id: number;
}

export interface PullRequestParticipant {
  [key: string]: string | number | boolean | Date | null;
  repository: string;
  pull_request_id: number;
  user_id: string;
  role: "PARTICIPANT" | "REVIEWER";
  approved: boolean;
  state: "approved" | "changes_requested" | null;
  participated_on: Date;
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

interface RawParticipant {
  type: string;
  user: RawUser;
  role: "PARTICIPANT" | "REVIEWER";
  approved: boolean;
  state: "approved" | "changes_requested" | null;
  participated_on: string;
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

function urlComponents(url: string): {
  workspace: string;
  repository: string;
} {
  const matchedGroups =
    /repositories\/(?<workspace>[a-z0-9-_]+)\/(?<repository>[a-z0-9-_]+)/i.exec(
      url
    )?.groups;
  if (
    !matchedGroups ||
    !matchedGroups["workspace"] ||
    !matchedGroups["repository"]
  ) {
    throw new Error("Failed to destruct URL!");
  }

  return {
    workspace: matchedGroups["workspace"],
    repository: matchedGroups["repository"],
  };
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
  state: string;
  created_on: string;
  updated_on: string;
  links: {
    self: {
      href: string;
    };
    commits: {
      href: string;
    };
    activity: {
      href: string;
    };
  };
}

interface RawRepository {
  links: {
    pullrequests: {
      href: string;
    };
  };
}

interface RawPullRequest {
  id: number;
  title: string;
  comment_count: number;
  task_count: number;
  closed_by: RawUser | null;
  author: RawUser;
  participants?: RawParticipant[]; // only included when fetching the PR by its id
  reviewers?: RawUser[]; // only included when fetching the PR by its id
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
  credentials: Credentials,
  initialUrl: string
): Promise<string | null> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });

  let nextPageLink: string | undefined;
  do {
    try {
      const url = nextPageLink || initialUrl;
      const response = await apiClient.get<ListResponse<RawCommit>>(url, {
        params: nextPageLink ? {} : { pagelen: 100 },
      });
      nextPageLink = response.data.next;

      if (!nextPageLink) {
        const commits = response.data.values;
        return commits[commits.length - 1].date;
      }
    } catch (error) {
      console.warn(
        `failed to fetch commits from '${nextPageLink || initialUrl}': ${error}`
      );
      return null;
    }
  } while (!!nextPageLink);

  return null;
}

export async function fetchUsers(
  credentials: Credentials,
  workspace: string
): Promise<User[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });

  const userList: User[] = [];

  let nextPageLink: string | undefined;
  do {
    console.log(`Fetching users`);
    const url = nextPageLink || `/workspaces/${workspace}/members`;
    const response = await apiClient.get<ListResponse<RawMember>>(url);
    nextPageLink = response.data.next;

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

export async function pullRequestUrls(
  credentials: Credentials,
  workspace: string,
  updated_since?: Dayjs
): Promise<string[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });

  const response = await apiClient.get<ListResponse<RawRepository>>(
    `https://api.bitbucket.org/2.0/repositories/${workspace}`,
    { params: { pagelen: 100 } }
  );
  const urls = response.data.values.map(
    (repository) => repository.links.pullrequests.href
  );

  return urls
    .map((urlString) =>
      ["OPEN", "MERGED"].map((state) => {
        const url = new URL(urlString);
        url.searchParams.append("pagelen", "50");
        url.searchParams.append("state", state);
        if (updated_since)
          url.searchParams.append(
            "q",
            `updated_on >= ${updated_since.toISOString()}`
          );
        return url.href;
      })
    )
    .flat();
}

export async function fetchPullRequests(
  credentials: Credentials,
  url: string
): Promise<{
  pullRequests: PullRequest[];
  activityUrls: string[];
  nextPageLink: string | undefined;
}> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });

  console.log(`Fetching pull requests from '${url}'`);
  const response = await apiClient.get<ListResponse<RawPullRequest>>(url);

  console.log(`Fetched ${response.data.values.length} pull requests`);

  const repository = urlComponents(url).repository;

  const pullRequests: PullRequest[] = await Promise.all(
    response.data.values.map(
      async ({
        id,
        title,
        comment_count,
        task_count,
        author,
        state,
        created_on,
        updated_on,
        links,
      }) => {
        const first_commit_on = await fetchFirstCommit(
          credentials,
          links.commits.href
        );

        return {
          repository,
          id,
          url: links.self.href,
          title,
          state,
          comment_count,
          task_count,
          author: author.uuid,
          created_on: dayjs(created_on).toDate(),
          updated_on: dayjs(updated_on).toDate(),
          first_commit_on: dayjs(first_commit_on || created_on).toDate(),
        };
      }
    )
  );

  const activityUrls = response.data.values.map(
    (responseData) => responseData.links.activity.href
  );

  return {
    pullRequests,
    activityUrls,
    nextPageLink: response.data.next,
  };
}

export async function fetchPullRequestParticipants(
  credentials: Credentials,
  url: string
): Promise<PullRequestParticipant[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });

  console.log(`Fetching participants for '${url}'`);
  const response = await apiClient.get<RawPullRequest>(url);

  return response.data.participants!.map((participant) => ({
    repository: urlComponents(url).repository,
    pull_request_id: response.data.id,
    user_id: participant.user.uuid,
    role: participant.role,
    approved: participant.approved,
    state: participant.state,
    participated_on: dayjs(participant.participated_on).toDate(),
  }));
}

export async function fetchPullRequestActivities(
  credentials: Credentials,
  url: string
): Promise<Activity[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    auth: credentials,
  });
  const repository = urlComponents(url).repository;

  const activityList: Activity[] = [];

  let nextPageLink: string | undefined;
  do {
    console.log(`Fetching activities from '${nextPageLink || url}'`);
    const response = await apiClient.get<ListResponse<RawActivity>>(
      nextPageLink || url,
      { params: nextPageLink ? {} : { pagelen: 50 } }
    );
    nextPageLink = response.data.next;

    console.log(`Fetched ${response.data.values.length} activities`);

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
            repository,
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
            repository,
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
            repository,
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
            repository,
            pull_request_id: rawActivity.pull_request.id,
          };
        } else {
          console.warn(`Unknown activity: ${JSON.stringify(rawActivity)}`);
          return null;
        }
      })
    );

    activityList.push(...activities);
  } while (!!nextPageLink);

  return activityList;
}
