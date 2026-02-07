# issues.cash

issues.cash is a bounty platform on Bitcoin Cash that allows the creation and funding of bounties associated to issues on GitHub and GitLab.

A smart contract holds the bounty funds, which gets released when a solution is approved via pull request.

This repository contains all the 

# Bounties

## Create a bounty

On an issue, comment:

```
/bounty <amount> --refund <address> [--expiry <days>]
```

The bot will reply with further instructions.

### Examples

```
# Basic bounty with default 90-day default expiry
/bounty 2.35 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p

# Custom 60-day expiry
/bounty 1.5 --refund bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p --expiry 60
```

### Details

- An issue can have only one bounty associated to it, unless the existing bounty is already refunded, or expired
- Pending bounties can be deleted by simply deleting the bot reply with the bounty details. A new bounty with different details can be created following that
- Once funded, a bounty can be refunded by closing the issue, as long as there are no open pull requests claiming it. If desired, a new bounty with new details can be created by re-opening the issue, and repeating the usual process

# Claims

## Claim a bounty

Create a pull request with the following in the body:

```
/claim <issue_number> --address <address>
```

### Example

```
/claim 42 --address bitcoincash:qp2p3p3p3p3p3p3p3p3p3p3p3p3p3p3p3p
```

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
