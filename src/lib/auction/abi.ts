// Generated from the V4 Solidity artifact by scripts/sync-auction-abi.mjs.
export const auctionAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'game_',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'nft_',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'AuctionAlreadySettled',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'endAt',
        type: 'uint256',
      },
    ],
    name: 'AuctionEnded',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'eligibleAt',
        type: 'uint256',
      },
    ],
    name: 'AuctionNotEligible',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'endAt',
        type: 'uint256',
      },
    ],
    name: 'AuctionNotEnded',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'AuctionNotSettled',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'AuctionNotStarted',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'minimumBid',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'proposedBid',
        type: 'uint256',
      },
    ],
    name: 'BidTooLow',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'expectedGame',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'actualGame',
        type: 'address',
      },
    ],
    name: 'CollectionGameMismatch',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'requiredValue',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'suppliedValue',
        type: 'uint256',
      },
    ],
    name: 'IncorrectBidFunding',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'firstNftId',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalSupply',
        type: 'uint256',
      },
    ],
    name: 'InvalidBatchRange',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'InvalidContractAddress',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
    ],
    name: 'InvalidRecipient',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'NftAlreadyDelivered',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'NftAlreadyRegistered',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'owner',
        type: 'address',
      },
    ],
    name: 'NftNotInCustody',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
    ],
    name: 'NoRefundCredit',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoSurplus',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
    ],
    name: 'OnlyGame',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
    ],
    name: 'OnlyWinner',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'ProceedsAlreadyForwarded',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrancyGuardReentrantCall',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'RefundTransferFailed',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'roundNum',
        type: 'uint256',
      },
    ],
    name: 'RoundAlreadyRegistered',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
    ],
    name: 'UnknownAuction',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'roundNum',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'firstNftId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'count',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'eligibleAt',
        type: 'uint256',
      },
    ],
    name: 'AuctionBatchRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'roundNum',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'ethPaid',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'endAt',
        type: 'uint256',
      },
    ],
    name: 'AuctionBidPlaced',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'winner',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
    ],
    name: 'AuctionNftDelivered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'roundNum',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'AuctionProceedsForwarded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'AuctionRefundCredited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'bidder',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'recipient',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'AuctionRefundWithdrawn',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'uint256',
        name: 'nftId',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'roundNum',
        type: 'uint256',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'winner',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'AuctionSettled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'AuctionSurplusForwarded',
    type: 'event',
  },
  {
    inputs: [],
    name: 'AUCTION_DURATION',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ELIGIBILITY_DELAY',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'EXTENSION_DURATION',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MINIMUM_BID',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MINIMUM_INCREASE_DIVISOR',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'NFTS_PER_BATCH',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalBidAmount_',
        type: 'uint256',
      },
    ],
    name: 'bid',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'recipient_',
        type: 'address',
      },
    ],
    name: 'claimNft',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'batchIndex_',
        type: 'uint256',
      },
    ],
    name: 'firstNftIdByBatchIndex',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
    ],
    name: 'forwardProceeds',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'forwardSurplus',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'game',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
    ],
    name: 'getAuction',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'roundNum',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'eligibleAt',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'endAt',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'highestBidder',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'highestBid',
            type: 'uint256',
          },
          {
            internalType: 'bool',
            name: 'registered',
            type: 'bool',
          },
          {
            internalType: 'bool',
            name: 'settled',
            type: 'bool',
          },
          {
            internalType: 'bool',
            name: 'delivered',
            type: 'bool',
          },
          {
            internalType: 'bool',
            name: 'proceedsForwarded',
            type: 'bool',
          },
        ],
        internalType: 'struct ICosmicSignatureArtAuction.Auction',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
    ],
    name: 'minimumNextBid',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'nft',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'refundCredits',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'roundNum_',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'firstNftId_',
        type: 'uint256',
      },
    ],
    name: 'registerAuctionBatch',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'registeredBatchCount',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    name: 'registeredRounds',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'nftId_',
        type: 'uint256',
      },
    ],
    name: 'settle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalBidEscrow',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalLiabilities',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalPendingProceeds',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalRefundCredits',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address payable',
        name: 'recipient_',
        type: 'address',
      },
    ],
    name: 'withdrawRefund',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;
