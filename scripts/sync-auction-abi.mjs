import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
async function main() {
  const artifactPath =
    process.argv[2] ??
    fileURLToPath(
      new URL(
        '../../Cosmic-Signature/artifacts/production/contracts/production/CosmicSignatureArtAuction.sol/CosmicSignatureArtAuction.json',
        import.meta.url,
      ),
    );
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  if (artifact.contractName !== 'CosmicSignatureArtAuction' || !Array.isArray(artifact.abi))
    throw new Error('Unexpected contract artifact');
  await writeFile(
    new URL('../src/lib/auction/abi.ts', import.meta.url),
    await format(
      `// Generated from the V4 Solidity artifact by scripts/sync-auction-abi.mjs.\nexport const auctionAbi = ${JSON.stringify(artifact.abi, null, 2)} as const;\n`,
      { parser: 'typescript', singleQuote: true, printWidth: 100, trailingComma: 'all' },
    ),
  );
}
await main();
