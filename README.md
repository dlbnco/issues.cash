# issues.cash

issues.cash is a bounty platform on Bitcoin Cash that allows the creation and funding of bounties associated to issues on GitHub and GitLab.

A smart contract holds the bounty funds, which gets released when a solution is approved via pull request.

This repository contains everything necessary to host the platform. It is a regular [Next.js](https://nextjs.org) project.

# Bounties

## Create a bounty

On an issue, comment:

```
/bounty <amount> --refund <address> [--expiry <days>]
```

The bot will reply with a contract address and funding instructions.

### Examples

```
# Basic bounty with 90-day default expiry
/bounty 2.35 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p

# Custom 60-day expiry
/bounty 1.5 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p --expiry 60
```

## Cancel a bounty

If a bounty has not been funded yet, the maintainer can cancel it by commenting:

```
/bounty cancel
```

This deletes the pending bounty from the system. For funded bounties, close the issue instead to trigger a refund.

## Claim a bounty

To claim a bounty, create a pull request that solves the issue and include the following in the PR body:

```
/claim <issue_number> --address <address>
```

### Example

```
/claim 42 --address bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p
```

When the PR is merged, the oracle verifies the event and releases the funds to the specified address.

## Refund a bounty

To refund a funded bounty, close the issue. The oracle will verify the event and return the funds to the `--refund` address specified when the bounty was created.

**Note**: Refunds are blocked if there are open pull requests claiming the bounty. Close or merge the PRs first.

## Expiry

Each bounty has an expiry date set by the `--expiry` flag (default: 90 days). After this period:

- The maintainer can reclaim the funds directly from the smart contract
- No oracle signature is required
- The bounty status changes to `EXPIRED`

## Commission

A commission may be charged on successful bounty completions (when a PR is merged):

- Commission is not charged on refunds or expired bounties
- The rate is configured by the platform operator
- Some projects may be designated as partners with 0% commission

When a bounty is claimed, the payout message will show:
- Bounty amount
- Network fees
- Commission amount and rate (if applicable)
- Final amount received by contributor

# GitHub app

The app can be installed in any repository here: https://github.com/apps/issues-cash

## Setting up the network

The app runs on `mainnet` by default. To run on `testnet3`, set the following Action variable `Settings -> Secrets and variables -> Actions -> Variables` on your GitHub repository:

```
BCH_NETWORK=testnet3
```

# GitLab integration

1. Create an access token for the bot in `Settings → Access Tokens`:
  - Role: Maintainer
  - Scopes: `api`

2. Configure the webhook in `Settings → Webhooks → Add new webhook`
   - URL: `https://issues.cash/api/webhooks/gitlab`
   - Secret token: a combination of a secret of your choice, plus the access token created in step number 1: `your-secret|glpat-xxxxxxxxxxxx`
   - Trigger: "Comments", "Issues events", "Merge request events"
   - Enable SSL verification: check

## Setting up the network

The app runs on `mainnet` by default. To run on `testnet3`, set the following project variable in `Settings -> CI/CD -> Variables`:

```
BCH_NETWORK=testnet3
```
