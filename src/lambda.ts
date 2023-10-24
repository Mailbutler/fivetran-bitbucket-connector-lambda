import { Handler } from "aws-lambda";
import { FivetranRequest, FivetranResponse } from "./fivetran";
import {
  Activity,
  PullRequest,
  User,
  fetchPullRequestActivities,
  fetchPullRequestsPage,
  fetchPullRequestsSince,
  fetchUsers,
} from "./bitbucket";
import dayjs from "dayjs";

export const handler: Handler<FivetranRequest, FivetranResponse> = async (
  event
) => {
  try {
    const initialSync = !event.state.since;
    const repositorySlugs = event.secrets.repositorySlugs.split(",");
    console.log(`Fetching information for ${repositorySlugs}`);

    const users: User[] = await fetchUsers(event.secrets);
    const pull_requests: PullRequest[] = [];
    const pull_request_activities: Activity[] = [];

    const nextPageLinks: Record<
      string,
      Record<string, string | undefined>
    > = {};

    for (const repoSlug of repositorySlugs) {
      if (!!event.setup_test) continue;

      const repoPullRequests: PullRequest[] = [];
      if (event.state.since) {
        const pullRequests = (
          await Promise.all(
            (["OPEN", "MERGED"] as const).map((state) =>
              fetchPullRequestsSince(
                event.secrets,
                repoSlug,
                state,
                dayjs(event.state.since)
              )
            )
          )
        ).flat();
        repoPullRequests.push(...pullRequests);
      } else {
        // initial sync case!
        nextPageLinks[repoSlug] = {};

        const openPullRequestData = await fetchPullRequestsPage(
          event.secrets,
          repoSlug,
          "OPEN",
          event.state.nextPageLinks?.[repoSlug]?.["OPEN"]
        );
        repoPullRequests.push(...openPullRequestData.pullRequests);
        nextPageLinks[repoSlug]["OPEN"] = openPullRequestData.nextPageLink;

        const mergedPullRequestData = await fetchPullRequestsPage(
          event.secrets,
          repoSlug,
          "MERGED",
          event.state.nextPageLinks?.[repoSlug]?.["MERGED"]
        );
        repoPullRequests.push(...mergedPullRequestData.pullRequests);
        nextPageLinks[repoSlug]["MERGED"] = mergedPullRequestData.nextPageLink;
      }

      const activities = (
        await Promise.all(
          repoPullRequests.map((pullRequest) =>
            fetchPullRequestActivities(event.secrets, repoSlug, pullRequest.id)
          )
        )
      ).flat();

      // add to 'global' lists
      pull_request_activities.push(...activities);
      pull_requests.push(...repoPullRequests);
    }

    const hasMoreForInitialSync =
      initialSync &&
      Object.values(nextPageLinks).some((links) =>
        Object.values(links).some((link) => !!link)
      );

    return {
      state: {
        since: hasMoreForInitialSync ? undefined : dayjs().toISOString(),
        nextPageLinks,
      },
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
      hasMore: hasMoreForInitialSync,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
