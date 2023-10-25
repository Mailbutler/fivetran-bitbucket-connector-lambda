import { Handler } from "aws-lambda";
import { FivetranRequest, FivetranResponse } from "./fivetran";
import {
  Activity,
  PullRequest,
  User,
  fetchPullRequestActivities,
  fetchPullRequests,
  fetchUsers,
  pullRequestUrls,
} from "./bitbucket";
import dayjs from "dayjs";

export const handler: Handler<FivetranRequest, FivetranResponse> = async (
  event
) => {
  try {
    const workspace = process.env.WORKSPACE;
    if (!workspace) throw new Error("Missing workspace!");

    const repositorySlugs = (process.env.REPOSITORY_SLUGS || "").split(",");
    console.log(`Fetching information for ${repositorySlugs}`);

    const updatedSince = event.state.since
      ? dayjs(event.state.since)
      : undefined;

    const users: User[] = await fetchUsers(event.secrets, workspace);
    const pull_requests: PullRequest[] = [];
    const pull_request_activities: Activity[] = [];

    const urls = event.state.nextPageLinks || [];
    if (urls.length === 0) {
      urls.push(...pullRequestUrls(workspace, repositorySlugs, updatedSince));
    }

    // prepare list of urls to check in another run --> `hasMore`
    const nextPageLinks: string[] = [];

    for (const url of urls) {
      if (!!event.setup_test) continue;

      const { pullRequests, nextPageLink, activityUrls } =
        await fetchPullRequests(event.secrets, url);

      if (nextPageLink) nextPageLinks.push(nextPageLink);

      const activities = (
        await Promise.all(
          activityUrls.map((activityUrl) =>
            fetchPullRequestActivities(event.secrets, activityUrl)
          )
        )
      ).flat();

      // add to 'global' lists
      pull_requests.push(...pullRequests);
      pull_request_activities.push(...activities);
    }

    return {
      state: {
        since: dayjs().toISOString(),
        nextPageLinks,
      },
      insert: {
        users,
        pull_requests,
        pull_request_activities,
      },
      schema: {
        users: { primary_key: ["uuid"] },
        pull_requests: { primary_key: ["repository", "id"] },
        pull_request_activities: { primary_key: ["uuid"] },
      },
      hasMore: nextPageLinks.length > 0,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
