import axios from "axios";
import { Dayjs } from "dayjs";

interface Config {
  accessToken: string;
  workspace: string;
}

interface Participant {
  type: string;
}

interface PullRequest {
  id: string;
  title: string;
  author: string;
  state: string;
  reviewers: Participant[];
  participants: Participant[];
  comment_count: number;
  task_count: number;
  created_on: string;
  updated_on: string;
  closed_by: Participant;
}

interface Repository {
  uuid: string;
  name: string;
  created_on: string;
  updated_on: string;
}

interface CommentActivity {
  created_on: string;
  user: {
    uuid: string;
  };
}

interface ApprovalActivity {
  date: string;
  user: {
    uuid: string;
  };
}

type ActivityResponse = ListResponse<{
  approval?: ApprovalActivity;
  comment?: CommentActivity;
}>;

interface Activity {
  uuid: string;
  type: "comment" | "approval";
  date: string;
  user_id: string;
}

interface ListResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  values: T[];
}

function pullRequest({
  id,
  title,
  author,
  state,
  reviewers,
  participants,
  comment_count,
  task_count,
  created_on,
  updated_on,
  closed_by,
}: PullRequest): PullRequest {
  return {
    id,
    title,
    author,
    state,
    reviewers,
    participants,
    comment_count,
    task_count,
    created_on,
    updated_on,
    closed_by,
  };
}

function repository({
  uuid,
  name,
  created_on,
  updated_on,
}: Repository): Repository {
  return { uuid, name, created_on, updated_on };
}

function activity({ uuid, type, date, user_id }: Activity): Activity {
  return {
    uuid,
    type,
    date,
    user_id,
  };
}

export async function fetchRepositories(config: Config): Promise<Repository[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  const repositoryList: Repository[] = [];

  let nextPageLink: string | undefined;
  do {
    try {
      const url = nextPageLink || `/repositories/${config.workspace}`;
      const response = await apiClient.get<ListResponse<Repository>>(url);

      repositoryList.push(...response.data.values);

      nextPageLink = response.data.next;
    } catch (error) {
      console.error("An error occurred:", error);
      break;
    }
  } while (!!nextPageLink);

  return repositoryList.map(repository);
}

export async function fetchPullRequests(
  config: Config,
  repoSlug: string,
  state: "OPEN" | "MERGED" | "DECLINED",
  updated_since: Dayjs
): Promise<PullRequest[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  const pullRequestList: PullRequest[] = [];

  let nextPageLink: string | undefined;
  do {
    try {
      const url =
        nextPageLink ||
        `/repositories/${config.workspace}/${repoSlug}/pullrequests`;
      const response = await apiClient.get<ListResponse<PullRequest>>(url, {
        params: {
          state,
          pagelen: 100,
          q: `updated_on >= ${updated_since.toISOString()}`,
        },
      });

      pullRequestList.push(...response.data.values);

      nextPageLink = response.data.next;
    } catch (error) {
      console.error("An error occurred:", error);
      break;
    }
  } while (!!nextPageLink);

  return pullRequestList.map(pullRequest);
}

export async function fetchPullRequestActivities(
  config: Config,
  repoSlug: string,
  pullRequestId: string
): Promise<Activity[]> {
  const apiClient = axios.create({
    baseURL: "https://api.bitbucket.org/2.0",
    headers: { Authorization: `Bearer ${config.accessToken}` },
  });

  const activityList: Activity[] = [];

  let nextPageLink: string | undefined;
  do {
    try {
      const url =
        nextPageLink ||
        `/repositories/${config.workspace}/${repoSlug}/pullrequests/${pullRequestId}/activity`;
      const response = await apiClient.get<ActivityResponse>(url);

      const convertedList = response.data.values
        .map((value) => {
          if (value.approval) {
            return {
              uuid: "",
              type: "approval",
              date: value.approval.date,
              user_id: value.approval.user.uuid,
            };
          } else if (value.comment) {
            return {
              uuid: "",
              type: "comment",
              date: value.comment.created_on,
              user_id: value.comment.user.uuid,
            };
          } else {
            return null;
          }
        })
        .filter((v) => !!v);
      activityList.push(...(convertedList as Activity[]));

      nextPageLink = response.data.next;
    } catch (error) {
      console.error("An error occurred:", error);
      break;
    }
  } while (!!nextPageLink);

  return activityList.map(activity);
}
