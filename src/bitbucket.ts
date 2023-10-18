import axios from "axios";
import { Dayjs } from "dayjs";

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

interface ListResponse<T> {
  size: number;
  page: number;
  pagelen: number;
  next?: string;
  values: T[];
}

async function pullRequests(
  workspace: string,
  repoSlug: string,
  updated_since: Dayjs,
  state: "OPEN" | "MERGED" | "DECLINED"
): Promise<PullRequest[]> {
  const pullRequestList: PullRequest[] = [];

  let nextPageLink: string | undefined;
  do {
    try {
      const url =
        nextPageLink ||
        `https://api.bitbucket.org/2.0/repositories/${workspace}/${repoSlug}/pullrequests`;
      const response = await axios.get<ListResponse<PullRequest>>(url, {
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

  return pullRequestList;
}
