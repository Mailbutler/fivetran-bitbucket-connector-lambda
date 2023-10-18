import { Handler } from "aws-lambda";
import { FivetranRequest, FivetranResponse } from "./fivetran";
import {
  Activity,
  PullRequest,
  fetchPullRequestActivities,
  fetchPullRequests,
} from "./bitbucket";
import dayjs from "dayjs";

export const handler: Handler<FivetranRequest, FivetranResponse> = async (
  event
) => {
  const repositorySlugs = event.secrets.repositorySlugs.split(",");

  const pull_requests: PullRequest[] = [];
  const pull_request_activities: Activity[] = [];

  repositorySlugs.forEach(async (repoSlug) => {
    const updatedSince = dayjs(event.state.since || "2018-01-01");
    const pullRequests = (
      await Promise.all(
        (["OPEN", "MERGED"] as const).map((state) =>
          fetchPullRequests(event.secrets, repoSlug, state, updatedSince)
        )
      )
    ).flat();
    pull_requests.push(...pullRequests);

    pullRequests.forEach(async (pullRequest) => {
      const activities = await fetchPullRequestActivities(
        event.secrets,
        repoSlug,
        pullRequest.id
      );
      pull_request_activities.push(...activities);
    });
  });

  return {
    state: { since: dayjs().toISOString() },
    insert: {
      pull_requests,
      pull_request_activities,
    },
    schema: {
      pull_requests: { primary_key: ["id"] },
      pull_request_activities: { primary_key: ["uuid"] },
    },
    hasMore: false,
  };
};
