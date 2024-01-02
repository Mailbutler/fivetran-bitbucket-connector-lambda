import { Handler } from "aws-lambda";
import { FivetranRequest, FivetranResponse } from "./fivetran";
import {
  Activity,
  PullRequest,
  PullRequestParticipant,
  User,
  fetchPullRequestActivities,
  fetchPullRequestParticipants,
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

    const updatedSince = event.state.since
      ? dayjs(event.state.since)
      : undefined;

    const users: User[] = await fetchUsers(event.secrets, workspace);
    const pull_requests: PullRequest[] = [];
    const pull_request_activities: Activity[] = [];
    const pull_request_participants: PullRequestParticipant[] = [];

    const urls = event.state.nextPageLinks || [];
    if (urls.length === 0) {
      urls.push(
        ...(await pullRequestUrls(event.secrets, workspace, updatedSince))
      );
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

      const participants = (
        await Promise.all(
          pullRequests.map((pullRequest) =>
            fetchPullRequestParticipants(event.secrets, pullRequest.url)
          )
        )
      ).flat();

      // add to 'global' lists
      pull_requests.push(...pullRequests);
      pull_request_activities.push(...activities);
      pull_request_participants.push(...participants);
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
        pull_request_participants,
      },
      schema: {
        users: { primary_key: ["uuid"] },
        pull_requests: { primary_key: ["repository", "id"] },
        pull_request_activities: { primary_key: ["uuid"] },
        pull_request_participants: {
          primary_key: ["repository", "pull_request_id", "user_id"],
        },
      },
      hasMore: nextPageLinks.length > 0,
    };
  } catch (error) {
    return {
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
