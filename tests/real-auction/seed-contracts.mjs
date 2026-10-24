import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';

async function main() {
  const contractRoot = process.env.ART_AUCTION_CONTRACT_ROOT;
  const output = process.env.ART_AUCTION_REHEARSAL_FILE;
  assert(contractRoot && output, 'Only the owned local runner may seed the fixture');
  const require = createRequire(resolve(contractRoot, 'package.json'));
  const hre = require('hardhat');
  assert.equal(hre.network.name, 'hardhat_on_localhost');
  assert.equal(hre.network.config.url, 'http://127.0.0.1:8548');
  assert.equal(await hre.network.provider.send('eth_chainId'), '0x7a69');
  assert.match(await hre.network.provider.send('web3_clientVersion'), /^HardhatNetwork\//);
  await hre.network.provider.send('hardhat_reset');
  const { deployV4Fixture } = require(resolve(contractRoot, 'test/src/V4UpgradeTestHelpers.js'));
  const { activateRoundBidAndClaimMainPrize } = require(
    resolve(contractRoot, 'test/src/GameRoundTestHelpers.js'),
  );
  const { findParsedEvent } = require(resolve(contractRoot, 'test/src/V2UpgradeTestHelpers.js'));
  const contracts = await deployV4Fixture();
  const game = contracts.cosmicSignatureGameV4Proxy;
  const auction = contracts.cosmicSignatureArtAuction;
  const nft = contracts.cosmicSignatureNft;
  const receipt = await activateRoundBidAndClaimMainPrize(contracts, game);
  const batch = findParsedEvent(receipt, auction, 'AuctionBatchRegistered');
  assert(batch, 'V4 finalization must register its real auction inventory');
  assert.equal(batch.args.count, 8n);
  const auctionAddress = await auction.getAddress();
  for (let offset = 0n; offset < 8n; offset++) {
    assert.equal(await nft.ownerOf(batch.args.firstNftId + offset), auctionAddress);
    assert.equal((await auction.getAuction(batch.args.firstNftId + offset)).endAt, 0n);
  }
  const actor = await (await hre.ethers.getContractFactory('ArtAuctionTestActor')).deploy();
  await actor.waitForDeployment();
  await (await actor.setRejectEth(true)).wait();
  await (await actor.setRejectNft(true)).wait();
  const runtime = await hre.ethers.provider.getCode(auctionAddress);
  const result = {
    rpcUrl: hre.network.config.url,
    chainId: 31337,
    auctionAddress,
    codeHash: hre.ethers.keccak256(runtime),
    tokenId: Number(batch.args.firstNftId),
    eligibleAt: batch.args.eligibleAt.toString(),
    gameAddress: await game.getAddress(),
    nftAddress: await nft.getAddress(),
    accounts: await Promise.all(
      (await hre.ethers.getSigners()).map((signer) => signer.getAddress()),
    ),
    gameAbi: JSON.parse(game.interface.formatJson()),
    nftAbi: JSON.parse(nft.interface.formatJson()),
    auctionAbi: JSON.parse(auction.interface.formatJson()),
    actorAddress: await actor.getAddress(),
    snapshotId: await hre.network.provider.send('evm_snapshot'),
    evidence: {
      game: 'Real V4 game and production periphery, upgraded through V1/V2/V3 locally',
      issuanceTransaction: receipt.hash,
      sourceCycle: batch.args.roundNum.toString(),
      finalizationBlock: receipt.blockNumber,
      auctionNfts: 8,
      arbitrumPrecompiles:
        'Repository FakeArbSys/FakeArbGasInfo shims; no native Arbitrum entropy or gas guarantee',
    },
  };
  await writeFile(output, JSON.stringify(result, null, 2));
  process.stdout.write(
    `Seeded real V4 auction inventory ${result.tokenId}–${result.tokenId + 7} on owned loopback chain.\n`,
  );
}

await main();
