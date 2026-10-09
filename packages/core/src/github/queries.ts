/**
 * GraphQL documents. Field names verified against the public GitHub schema
 * (octokit/graphql-schema, schema.graphql) — see docs/ARCHITECTURE.md.
 */

export const RATE_LIMIT_FIELDS = "rateLimit { cost remaining resetAt limit used }";

const REPO = `
  id name nameWithOwner url description stargazerCount isFork isArchived isPrivate viewerPermission
  owner { login avatarUrl }
  primaryLanguage { name color }
  defaultBranchRef { name }
`;

const ACTOR = "login avatarUrl __typename";

const COMMENTS = `comments(last: 30) { totalCount nodes { id author { ${ACTOR} } authorAssociation body createdAt url } }`;

const LINKED = `id number title url state author { login } repository { nameWithOwner }`;

const REVIEW = `id state submittedAt body url authorAssociation author { ${ACTOR} }`;

const TIMELINE_TYPES = [
  "ASSIGNED_EVENT",
  "UNASSIGNED_EVENT",
  "LABELED_EVENT",
  "CLOSED_EVENT",
  "REOPENED_EVENT",
  "CROSS_REFERENCED_EVENT",
];
const PR_TIMELINE_TYPES = [
  ...TIMELINE_TYPES,
  "REVIEW_REQUESTED_EVENT",
  "READY_FOR_REVIEW_EVENT",
  "CONVERT_TO_DRAFT_EVENT",
  "MERGED_EVENT",
  "HEAD_REF_FORCE_PUSHED_EVENT",
];

const TIMELINE_NODES = `
  __typename
  ... on AssignedEvent { id createdAt actor { login } assignee { ... on User { login } } }
  ... on UnassignedEvent { id createdAt actor { login } }
  ... on LabeledEvent { id createdAt actor { login } label { name } }
  ... on ClosedEvent { id createdAt actor { login } }
  ... on ReopenedEvent { id createdAt actor { login } }
  ... on CrossReferencedEvent { id createdAt actor { login } }
`;
const PR_TIMELINE_NODES = `${TIMELINE_NODES}
  ... on ReviewRequestedEvent { id createdAt actor { login } }
  ... on ReadyForReviewEvent { id createdAt actor { login } }
  ... on ConvertToDraftEvent { id createdAt actor { login } }
  ... on MergedEvent { id createdAt actor { login } }
  ... on HeadRefForcePushedEvent { id createdAt actor { login } }
`;

export const PR_FIELDS = `
  __typename id number title body state isDraft locked url createdAt updatedAt closedAt mergedAt
  mergedBy { login }
  author { ${ACTOR} } authorAssociation
  repository { ${REPO} }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  milestone { title }
  ${COMMENTS}
  baseRefName headRefName additions deletions changedFiles mergeable mergeStateStatus reviewDecision
  participants(first: 20) { nodes { login } }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login avatarUrl } ... on Bot { login } ... on Mannequin { login } ... on Team { slug } } } }
  latestReviews(first: 20) { nodes { ${REVIEW} } }
  reviews(last: 40) { nodes { ${REVIEW} } }
  reviewThreads(first: 100) { totalCount nodes { isResolved } }
  commits(last: 1) { nodes { commit { oid statusCheckRollup { state contexts(first: 60) { nodes {
    __typename
    ... on CheckRun { id name status conclusion detailsUrl completedAt }
    ... on StatusContext { id context state targetUrl createdAt }
  } } } } } }
  closingIssuesReferences(first: 10) { nodes { ${LINKED} } }
  timelineItems(last: 30, itemTypes: [${PR_TIMELINE_TYPES.join(", ")}]) { nodes { ${PR_TIMELINE_NODES} } }
`;

export const ISSUE_FIELDS = `
  __typename id number title body state stateReason locked url createdAt updatedAt closedAt
  author { ${ACTOR} } authorAssociation
  repository { ${REPO} }
  labels(first: 20) { nodes { name color } }
  assignees(first: 10) { nodes { login } }
  milestone { title }
  participants(first: 20) { nodes { login } }
  ${COMMENTS}
  closedByPullRequestsReferences(first: 10, includeClosedPrs: true) { nodes { ${LINKED} isDraft } }
  timelineItems(last: 30, itemTypes: [${TIMELINE_TYPES.join(", ")}]) { nodes { ${TIMELINE_NODES} } }
`;

export const DISCUSSION_FIELDS = `
  __typename id number title body closed closedAt locked url createdAt updatedAt
  author { ${ACTOR} } authorAssociation
  repository { ${REPO} }
  labels(first: 20) { nodes { name color } }
  ${COMMENTS}
`;

export const HYDRATE_QUERY = `
  query Hydrate($ids: [ID!]!) {
    ${RATE_LIMIT_FIELDS}
    nodes(ids: $ids) {
      ... on PullRequest { ${PR_FIELDS} }
      ... on Issue { ${ISSUE_FIELDS} }
      ... on Discussion { ${DISCUSSION_FIELDS} }
    }
  }
`;

export const SEARCH_QUERY = `
  query Search($q: String!, $type: SearchType!, $after: String) {
    ${RATE_LIMIT_FIELDS}
    search(query: $q, type: $type, first: 100, after: $after) {
      issueCount
      discussionCount
      pageInfo { hasNextPage endCursor }
      nodes {
        __typename
        ... on Issue { id updatedAt }
        ... on PullRequest { id updatedAt }
        ... on Discussion { id updatedAt }
      }
    }
  }
`;

export const RESOLVE_QUERY = `
  query Resolve($owner: String!, $name: String!, $number: Int!) {
    ${RATE_LIMIT_FIELDS}
    repository(owner: $owner, name: $name) {
      issueOrPullRequest(number: $number) { __typename ... on Issue { id } ... on PullRequest { id } }
      discussion(number: $number) { id }
    }
  }
`;

export const VIEWER_QUERY = `query Viewer { ${RATE_LIMIT_FIELDS} viewer { login name avatarUrl id } }`;
