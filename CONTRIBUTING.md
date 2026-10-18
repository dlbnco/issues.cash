# Contributing

## Chipnet escrow changes

Changes to the CashScript contract, escrow and settlement code, Chipnet E2E tests, or their workflow configuration require the **Chipnet E2E gate** before merging.

Run the offline suite before opening a pull request:

```bash
yarn test:e2e:offline
```

Repository branches run the live Chipnet suite in GitHub Actions after the protected `chipnet-e2e` environment is approved.

### Fork pull requests

Fork workflows never receive this repository's Chipnet wallet secret. When a fork PR changes Chipnet E2E-relevant files, the gate intentionally fails until a maintainer has verified it:

1. A maintainer reviews the fork changes, especially `contracts/`, `e2e/`, `package.json`, `yarn.lock`, and GitHub Actions workflows.
2. The maintainer checks out the PR and runs the live suite using a dedicated, low-balance Chipnet wallet:

   ```bash
   gh pr checkout <number>
   E2E_RUN_CHIPNET=1 E2E_FUNDER_WIF='your-test-only-chipnet-WIF' NEXT_PUBLIC_BCH_NETWORK=testnet3 yarn test:e2e
   ```

3. After it passes, a maintainer adds the `chipnet-verified` label to the PR. This re-runs the gate.

Remove the label when the PR head changes, and repeat the live test before adding it again. Never use a mainnet key; see [README.md](README.md#real-chipnet-transaction-tests) for wallet, funding, and recovery details.
