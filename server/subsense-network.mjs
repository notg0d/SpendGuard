const NETWORKS = Object.freeze({
  testnet: Object.freeze({
    network: 'testnet',
    label: 'Testnet',
    chain: 'sui-testnet',
    tatumUrl: 'https://sui-testnet.gateway.tatum.io/graphql',
    // Current official MemWal GitHub docs; the older published staging hostname has invalid TLS.
    walrusUrl: 'https://relayer.dev.memwal.ai',
  }),
  mainnet: Object.freeze({
    network: 'mainnet',
    label: 'Mainnet',
    chain: 'sui-mainnet',
    tatumUrl: 'https://sui-mainnet.gateway.tatum.io/graphql',
    walrusUrl: 'https://relayer.memory.walrus.xyz',
  }),
});

export function networkConfig(
  network = process.env.SUBSENSE_NETWORK ?? 'mainnet',
) {
  if (!Object.hasOwn(NETWORKS, network))
    throw new Error(
      'SUBSENSE_NETWORK must be testnet or mainnet. No network fallback is allowed.',
    );
  return NETWORKS[network];
}

export function requireNetwork(network) {
  if (network !== networkConfig().network)
    throw new Error(
      'Network changed or missing. Refresh the app and confirm the active network before retrying.',
    );
}
