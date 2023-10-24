import { Handler } from "aws-lambda";
import { FivetranRequest, FivetranResponse } from "./fivetran";
import {
  Activity,
  PullRequest,
  User,
  fetchPullRequestActivities,
  fetchPullRequests,
  fetchUsers,
} from "./bitbucket";
import dayjs from "dayjs";

export const handler: Handler<FivetranRequest, FivetranResponse> = async (
  event
) => {
  try {
    const repositorySlugs = event.secrets.repositorySlugs.split(",");
    console.log(`Fetching information for ${repositorySlugs}`);

    const users: User[] = await fetchUsers(event.secrets);
    const pull_requests: PullRequest[] = [];
    const pull_request_activities: Activity[] = [];

    for (const repoSlug of repositorySlugs) {
      if (!!event.setup_test) continue;

      const updatedSince = dayjs(event.state.since || "2015-01-01T00:00:00Z");
      const pullRequests = (
        await Promise.all(
          (["OPEN", "MERGED"] as const).map((state) =>
            fetchPullRequests(event.secrets, repoSlug, state, updatedSince)
          )
        )
      ).flat();

      const activities = (
        await Promise.all(
          pullRequests.map((pullRequest) =>
            fetchPullRequestActivities(event.secrets, repoSlug, pullRequest.id)
          )
        )
      ).flat();

      // add to global lists
      pull_requests.push(...pullRequests);
      pull_request_activities.push(...activities);
    }

    return {
      state: { since: dayjs().toISOString() },
      insert: {
        users,
        pull_requests,
        pull_request_activities,
      },
      schema: {
        users: { primary_key: ["uuid"] },
        pull_requests: { primary_key: ["id"] },
        pull_request_activities: { primary_key: ["uuid"] },
      },
      hasMore: false,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
