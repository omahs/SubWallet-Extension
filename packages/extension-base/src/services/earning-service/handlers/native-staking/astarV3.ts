// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { _ChainInfo } from '@subwallet/chain-list/types';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType, ExtrinsicType, NominationInfo, UnstakingInfo } from '@subwallet/extension-base/background/KoniTypes';
import { getEarningStatusByNominations } from '@subwallet/extension-base/koni/api/staking/bonding/utils';
import { _EXPECTED_BLOCK_TIME, _STAKING_ERA_LENGTH_MAP } from '@subwallet/extension-base/services/chain-service/constants';
import { _SubstrateApi } from '@subwallet/extension-base/services/chain-service/types';
import BaseParaNativeStakingPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/native-staking/base-para';
import { AstarDappV3PositionInfo, BaseYieldPositionInfo, EarningStatus, NativeYieldPoolInfo, PalletDappsStakingDappInfo, PalletDappStakingV3AccountLedger, PalletDappStakingV3ContractStakeAmount, PalletDappStakingV3DappInfo, PalletDappStakingV3PeriodEndInfo, PalletDappStakingV3ProtocolState, PalletDappStakingV3SingularStakingInfo, PalletDappStakingV3StakeInfo, StakeCancelWithdrawalParams, SubmitJoinNativeStaking, TransactionData, UnstakingStatus, ValidatorInfo, YieldPoolInfo, YieldPoolMethodInfo, YieldPositionInfo, YieldStepBaseInfo, YieldStepType, YieldTokenBaseInfo } from '@subwallet/extension-base/types';
import { balanceFormatter, formatNumber, isUrl, reformatAddress } from '@subwallet/extension-base/utils';
import BigN from 'bignumber.js';
import fetch from 'cross-fetch';

import { SubmittableExtrinsic } from '@polkadot/api/promise/types';
import { UnsubscribePromise } from '@polkadot/api-base/types/base';
import { Codec } from '@polkadot/types/types';
import { BN, BN_ZERO } from '@polkadot/util';
import { isEthereumAddress } from '@polkadot/util-crypto';

const convertAddress = (address: string) => {
  return isEthereumAddress(address) ? address.toLowerCase() : address;
};

const isHasStakedCheck = (stakedInfo: PalletDappStakingV3StakeInfo): boolean => {
  return !(stakedInfo.voting === '0' && stakedInfo.buildAndEarn === '0' && stakedInfo.era === 0 && stakedInfo.period === 0);
};

const isHasStakedFutureCheck = (stakedInfo: PalletDappStakingV3StakeInfo): boolean => {
  return stakedInfo !== null;
};

const getPeriodEndInfo = (period: number, _periodEnd: any[]): PalletDappStakingV3PeriodEndInfo => {
  for (const periodEndInfo of _periodEnd) {
    const _periodNumber = periodEndInfo[0].toHuman() as number[];
    const periodNumber = _periodNumber[0];
    const periodInfo = periodEndInfo[1].toHuman() as PalletDappStakingV3PeriodEndInfo;

    if (period === periodNumber) {
      return periodInfo;
    }
  }

  return {
    bonusRewardPool: '0',
    totalVpStake: '0',
    finalEra: '0'
  };
};

export default class AstarV3NativeStakingPoolHandler extends BaseParaNativeStakingPoolHandler {
  protected override readonly availableMethod: YieldPoolMethodInfo = {
    join: true,
    defaultUnstake: true,
    fastUnstake: false,
    cancelUnstake: false,
    withdraw: true,
    claimReward: true
  };

  /* Subscribe pool info */

  async subscribePoolInfo (callback: (data: YieldPoolInfo) => void): Promise<VoidFunction> {
    let cancel = false;
    const nativeToken = this.nativeToken;

    const defaultCallback = async () => {
      const data: NativeYieldPoolInfo = {
        ...this.baseInfo,
        type: this.type,
        metadata: {
          ...this.metadataInfo,
          description: this.getDescription()
        }
      };

      const poolInfo = await this.getPoolInfo();

      !poolInfo && callback(data);
    };

    if (!this.isActive) {
      await defaultCallback();

      return () => {
        cancel = true;
      };
    }

    await defaultCallback();

    // todo: The API is deprecated, need update
    // const apyPromise = new Promise((resolve) => {
    //   fetch(`https://api.astar.network/api/v1/${this.chain}/dapps-staking/apy`, {
    //     method: 'GET'
    //   }).then((resp) => {
    //     resolve(resp.json());
    //   }).catch((e) => {
    //     console.error(e);
    //     resolve(null);
    //   });
    // });

    // const timeout = new Promise((resolve) => {
    //   const id = setTimeout(() => {
    //     clearTimeout(id);
    //     resolve(null);
    //   }, 8000);
    // });
    //
    // const apyRacePromise = Promise.race([
    //   timeout,
    //   apyPromise
    // ]); // need race because API often timeout

    // let apyInfo: null | number;
    //
    // try {
    //   apyInfo = (await apyRacePromise) as number | null;
    // } catch (e) {
    //   apyInfo = null;
    // }

    const substrateApi = await this.substrateApi.isReady;

    const unsub = await (substrateApi.api.query.dappStaking.activeProtocolState((_activeProtocolState: Codec) => {
      if (cancel) {
        unsub();

        return;
      }

      const activeProtocolState = _activeProtocolState.toPrimitive() as unknown as PalletDappStakingV3ProtocolState;
      const era = activeProtocolState.era;

      const minDelegatorStake = substrateApi.api.consts.dappStaking.minimumStakeAmount.toString();
      const unstakingDelay = substrateApi.api.consts.dappStaking.unlockingPeriod.toString(); // in eras
      const maxNumberOfStakedContracts = substrateApi.api.consts.dappStaking.maxNumberOfStakedContracts.toString(); // todo: check this

      const eraTime = _STAKING_ERA_LENGTH_MAP[this.chain] || _STAKING_ERA_LENGTH_MAP.default; // in hours
      const unstakingPeriod = parseInt(unstakingDelay) * eraTime;
      const minToHuman = formatNumber(minDelegatorStake, nativeToken.decimals || 0, balanceFormatter);

      const data: NativeYieldPoolInfo = {
        ...this.baseInfo,
        type: this.type,
        metadata: {
          ...this.metadataInfo,
          description: this.getDescription(minToHuman)
        },
        statistic: {
          assetEarning: [
            {
              slug: this.nativeToken.slug
              // apy: apyInfo !== null ? apyInfo : undefined
            }
          ],
          maxCandidatePerFarmer: parseInt(maxNumberOfStakedContracts), // temporary fix for Astar, there's no limit for now
          maxWithdrawalRequestPerFarmer: 1, // by default
          earningThreshold: {
            join: minDelegatorStake,
            defaultUnstake: '0',
            fastUnstake: '0'
          },
          farmerCount: 0, // TODO recheck=
          era: parseInt(era),
          eraTime,
          tvl: undefined, // TODO recheck
          // totalApy: apyInfo !== null ? apyInfo : undefined, // TODO recheck
          unstakingPeriod
        }
      };

      callback(data);
    }) as unknown as UnsubscribePromise);

    return () => {
      cancel = true;
      unsub();
    };
  }

  /* Subscribe pool info */

  /* Subscribe pool position */

  async parseNominatorMetadata (chainInfo: _ChainInfo, address: string, substrateApi: _SubstrateApi, ledger: PalletDappStakingV3AccountLedger, bnLocked: BigN): Promise<Omit<AstarDappV3PositionInfo, keyof BaseYieldPositionInfo>> {
    const nominationList: NominationInfo[] = [];
    const unstakingList: UnstakingInfo[] = [];

    const allDappsReq = new Promise((resolve) => {
      fetch(`https://api.astar.network/api/v3/${this.chain}/dapps-staking/chaindapps`, {
        method: 'GET'
      }).then((resp) => {
        resolve(resp.json());
      }).catch(console.error);
    });

    const [_activeProtocolState, _allDapps, _stakerInfo, _currentBlock] = await Promise.all([
      substrateApi.api.query.dappStaking.activeProtocolState(),
      allDappsReq,
      substrateApi.api.query.dappStaking.stakerInfo.entries(address),
      substrateApi.api.query.system.number()
    ]);

    const currentBlock = _currentBlock.toPrimitive() as string;
    const minDelegatorStake = substrateApi.api.consts.dappStaking.minimumStakeAmount.toString();
    const allDapps = _allDapps as PalletDappStakingV3DappInfo[];
    const activeProtocolState = _activeProtocolState.toPrimitive() as unknown as PalletDappStakingV3ProtocolState;
    const currentPeriod = activeProtocolState.periodInfo.number;

    let bnTotalStake = BN_ZERO;
    let bnTotalActiveStake = BN_ZERO;

    if (_stakerInfo.length > 0) {
      const dAppInfoMap: Record<string, PalletDappStakingV3DappInfo> = {};

      allDapps.forEach((dappInfo) => {
        dAppInfoMap[convertAddress(dappInfo.contractAddress)] = dappInfo;
      });

      for (const item of _stakerInfo) {
        const data = item[0].toHuman() as unknown as any[];
        const stakedDapp = data[1] as Record<string, string>;
        const _dappAddress = stakedDapp.Evm ? stakedDapp.Evm.toLowerCase() : stakedDapp.Wasm;
        const dappAddress = convertAddress(_dappAddress);

        const stakedInfo = item[1].toPrimitive() as unknown as PalletDappStakingV3SingularStakingInfo;
        const stakeData = stakedInfo.staked;
        const bnBuildAndEarn = new BN(stakeData.buildAndEarn);
        const bnVoting = new BN(stakeData.voting);
        const period = stakeData.period;

        const bnCurrentStake = bnBuildAndEarn.add(bnVoting) || new BN(0);

        if (bnCurrentStake.gt(BN_ZERO)) {
          const dappEarningStatus = bnCurrentStake.gt(BN_ZERO) && bnCurrentStake.gte(new BN(minDelegatorStake)) && currentPeriod === period ? EarningStatus.EARNING_REWARD : EarningStatus.NOT_EARNING;

          bnTotalStake = bnTotalStake.add(bnCurrentStake);

          // todo: check Dapp unregistered?
          if (currentPeriod === period) {
            bnTotalActiveStake = bnTotalActiveStake.add(bnCurrentStake);
          }

          const dappInfo = dAppInfoMap[dappAddress];

          nominationList.push({
            status: dappEarningStatus,
            chain: chainInfo.slug,
            validatorAddress: dappAddress,
            activeStake: bnCurrentStake.toString(),
            validatorMinStake: '0',
            validatorIdentity: dappInfo?.contractAddress,
            hasUnstaking: false // cannot get unstaking info by dapp
          });
        }
      }
    }

    const unlockingChunks = ledger.unlocking;

    if (unlockingChunks.length > 0) {
      for (const unlockingChunk of unlockingChunks) {
        const amount = unlockingChunk.amount;
        const unlockBlock = unlockingChunk.unlockBlock;

        const remainingBlocks = parseInt(unlockBlock) - parseInt(currentBlock);
        const isClaimable = remainingBlocks <= 0;
        const currentTimestampMs = Date.now();
        const waitingTimeMs = remainingBlocks * _EXPECTED_BLOCK_TIME[chainInfo.slug] * 1000;

        unstakingList.push({
          chain: chainInfo.slug,
          status: isClaimable ? UnstakingStatus.CLAIMABLE : UnstakingStatus.UNLOCKING,
          claimable: amount,
          // waitingTime
          targetTimestampMs: isClaimable ? undefined : currentTimestampMs + waitingTimeMs
        });
      }
    }

    // Handle locked amount for pool position
    if (nominationList.length === 0 && unstakingList.length === 0 && !bnLocked.gt(new BigN(0))) {
      return {
        balanceToken: this.nativeToken.slug,
        totalLock: '0',
        totalStake: '0',
        unstakeBalance: '0',
        status: EarningStatus.NOT_STAKING,
        isBondedBefore: false,
        activeStake: '0',
        nominations: [],
        unstakings: []
      };
    }

    const stakingStatus = getEarningStatusByNominations(bnTotalActiveStake, nominationList);
    const unlockingBalance = unstakingList.reduce((old, currentValue) => {
      return old.add(new BN(currentValue.claimable));
    }, BN_ZERO);

    // todo: UI need to handle position by lock, not totalStake/activeStake
    return {
      status: stakingStatus,
      balanceToken: this.nativeToken.slug,
      totalLock: bnLocked.toString(),
      totalStake: bnTotalActiveStake.toString(),
      activeStake: bnTotalActiveStake.toString(),
      unstakeBalance: unlockingBalance.toString(), // actually unlocking balance
      isBondedBefore: bnTotalActiveStake.gt(BN_ZERO),
      nominations: nominationList,
      unstakings: unstakingList // actually unlocking list
    };
  }

  async subscribePoolPosition (useAddresses: string[], resultCallback: (rs: YieldPositionInfo) => void): Promise<VoidFunction> {
    let cancel = false;
    const substrateApi = await this.substrateApi.isReady;
    const defaultInfo = this.baseInfo;
    const chainInfo = this.chainInfo;

    const unsub = await substrateApi.api.query.dappStaking.ledger.multi(useAddresses, async (ledgers: Codec[]) => {
      if (cancel) {
        unsub();

        return;
      }

      if (ledgers) {
        await Promise.all(ledgers.map(async (_ledger, i) => {
          const owner = reformatAddress(useAddresses[i], 42);

          const ledger = _ledger.toPrimitive() as unknown as PalletDappStakingV3AccountLedger;

          const bnLocked = new BigN(ledger.locked);

          if (ledger && bnLocked.gt(BigN(0))) {
            const nominatorMetadata = await this.parseNominatorMetadata(chainInfo, owner, substrateApi, ledger, bnLocked);

            resultCallback({
              ...defaultInfo,
              ...nominatorMetadata,
              address: owner,
              type: this.type
            });
          } else {
            resultCallback({
              ...defaultInfo,
              type: this.type,
              address: owner,
              balanceToken: this.nativeToken.slug,
              totalLock: '0',
              totalStake: '0',
              activeStake: '0',
              unstakeBalance: '0',
              isBondedBefore: false,
              status: EarningStatus.NOT_STAKING,
              nominations: [],
              unstakings: []
            });
          }
        }));
      }
    });

    return () => {
      cancel = true;
      unsub();
    };
  }

  /* Subscribe pool position */

  /* Get pool targets */

  async getPoolTargets (): Promise<ValidatorInfo[]> {
    const substrateApi = await this.substrateApi.isReady;
    // todo: check if there any limit on max staker on a dapp this

    const allDappsInfo: ValidatorInfo[] = [];

    // Get Dapp V3 info
    const allDappsReq = new Promise((resolve) => {
      fetch(`https://api.astar.network/api/v3/${this.chain}/dapps-staking/chaindapps`, {
        method: 'GET'
      }).then((resp) => {
        resolve(resp.json());
      }).catch(console.error);
    });

    // Get Dapp Name and Icon
    const allDappsExtra = new Promise((resolve) => {
      fetch(`https://api.astar.network/api/v1/${this.chain}/dapps-staking/dappssimple`, {
        method: 'GET'
      }).then((resp) => {
        resolve(resp.json());
      }).catch(console.error);
    });

    const [_activeProtocolState, _allDapps, _allDappsExtra, _contractInfo] = await Promise.all([
      substrateApi.api.query.dappStaking.activeProtocolState(),
      allDappsReq,
      allDappsExtra,
      substrateApi.api.query.dappStaking.contractStake.entries()
    ]);

    const activeProtocolState = _activeProtocolState.toPrimitive() as unknown as PalletDappStakingV3ProtocolState;
    const era = activeProtocolState.era;

    const allDapps = _allDapps as PalletDappStakingV3DappInfo[];
    const allDappsExt = _allDappsExtra as PalletDappsStakingDappInfo[];

    const allDappsExtMap: Record<string, PalletDappsStakingDappInfo> = {};

    allDappsExt.forEach((dappInfo) => {
      allDappsExtMap[dappInfo.address] = dappInfo;
    });

    const contractInfoMap: Record<string, PalletDappStakingV3ContractStakeAmount> = {};

    for (const contract of _contractInfo) {
      const _dappId = contract[0].toHuman() as string;
      const dappId = parseInt(_dappId);

      contractInfoMap[dappId] = contract[1].toHuman() as unknown as PalletDappStakingV3ContractStakeAmount;
    }

    allDapps.forEach((dappInfo) => {
      const dappAddress = dappInfo.contractAddress;
      const dappId = dappInfo.dappId;
      const stakersCount = dappInfo.stakersCount;

      let dappName;
      let dappIcon;

      if (Object.keys(allDappsExtMap).includes(dappAddress)) {
        dappName = allDappsExtMap[dappAddress].name;
        dappIcon = isUrl(allDappsExtMap[dappAddress].iconUrl) ? allDappsExtMap[dappAddress].iconUrl : undefined;
      }

      const contractInfo = contractInfoMap[dappId];

      let totalStake = '0';

      if (contractInfo) {
        const staked = contractInfo.staked;
        const stakedFuture = contractInfo.stakedFuture;
        const isHasStaked = isHasStakedCheck(staked);
        const isHasStakedFuture = isHasStakedFutureCheck(stakedFuture);

        const eraStaked = staked?.era.toString();
        const eraStakedFuture = stakedFuture?.era.toString();

        // todo: check this
        // todo: check if need to store voting and B&E amount seperately

        if (isHasStakedFuture && eraStakedFuture <= era) {
          const bnVoting = new BigN(contractInfo.stakedFuture?.voting);
          const bnBuildAndEarn = new BigN(contractInfo.stakedFuture?.buildAndEarn);

          totalStake = bnVoting.plus(bnBuildAndEarn).toString();
        } else if (!isHasStakedFuture && isHasStaked && eraStaked <= era) {
          const bnVoting = new BigN(contractInfo.staked?.voting);
          const bnBuildAndEarn = new BigN(contractInfo.staked?.buildAndEarn);

          totalStake = bnVoting.plus(bnBuildAndEarn).toString();
        }
      }

      allDappsInfo.push({
        commission: 0,
        expectedReturn: 0,
        address: convertAddress(dappAddress),
        totalStake: totalStake,
        ownStake: '0',
        otherStake: totalStake.toString(),
        nominatorCount: stakersCount,
        blocked: false,
        isVerified: false,
        minBond: '0',
        icon: dappIcon || undefined,
        identity: dappName || undefined,
        chain: this.chain,
        isCrowded: false // stakerCount >= maxStakerPerContract
      });
    });

    return allDappsInfo;
  }

  /* Get pool targets */

  /* Join pool action */

  override get defaultSubmitStep (): YieldStepBaseInfo {
    return [
      {
        name: 'Nominate dApps',
        type: YieldStepType.NOMINATE
      },
      {
        slug: this.nativeToken.slug,
        amount: '0'
      }
    ];
  }

  async createJoinExtrinsic (data: SubmitJoinNativeStaking, positionInfo?: AstarDappV3PositionInfo, bondDest = 'Staked'): Promise<[TransactionData, YieldTokenBaseInfo]> {
    // todo: handle join in the last era.
    const { amount, selectedValidators: targetValidators } = data;
    const chainApi = await this.substrateApi.isReady;
    const bnAmount = new BN(amount);

    // Get the current active locked amount = totalLock - totalUnlock - totalStake
    let bnActiveLock = BN_ZERO;

    if (positionInfo) {
      const bnTotalLock = new BN(positionInfo.totalLock) || BN_ZERO;
      const bnTotalStake = new BN(positionInfo.totalStake) || BN_ZERO;
      const bnUnlocking = new BN(positionInfo.unstakeBalance) || BN_ZERO;

      bnActiveLock = bnTotalLock.sub(bnTotalStake).sub(bnUnlocking);
    }

    const dappInfo = targetValidators[0];
    const dappParam = isEthereumAddress(dappInfo.address) ? { Evm: dappInfo.address } : { Wasm: dappInfo.address };

    let extrinsic: SubmittableExtrinsic;

    if (bnActiveLock.gt(BN_ZERO) && bnActiveLock.gte(bnAmount)) {
      extrinsic = chainApi.api.tx.dappStaking.stake(dappParam, bnAmount);
    } else if (bnActiveLock.gt(BN_ZERO) && bnActiveLock.lt(bnAmount)) {
      extrinsic = chainApi.api.tx.utility.batch([
        chainApi.api.tx.dappStaking.lock(bnAmount.sub(bnActiveLock)),
        chainApi.api.tx.dappStaking.stake(dappParam, bnAmount)
      ]);
    } else {
      extrinsic = chainApi.api.tx.utility.batch([
        chainApi.api.tx.dappStaking.lock(bnAmount),
        chainApi.api.tx.dappStaking.stake(dappParam, bnAmount)
      ]);
    }

    const tokenSlug = this.nativeToken.slug;

    return [extrinsic, { slug: tokenSlug, amount: '0' }];
  }

  /* Join pool action */

  /* Leave pool action */

  async handleYieldUnstake (amount: string, address: string, selectedTarget?: string): Promise<[ExtrinsicType, TransactionData]> {
    const chainApi = await this.substrateApi.isReady;
    const bnAmount = new BN(amount);

    if (!selectedTarget) {
      return Promise.reject(new TransactionError(BasicTxErrorType.INVALID_PARAMS));
    }

    const dappParam = isEthereumAddress(selectedTarget) ? { Evm: selectedTarget } : { Wasm: selectedTarget };

    const extrinsic = chainApi.api.tx.dappStaking.unstake(dappParam, bnAmount);

    return [ExtrinsicType.STAKING_LEAVE_POOL, extrinsic];
  }

  /* Leave pool action */

  /* Handle unlock action */
  // todo: add button to unlock
  async handleUnlock (amount: string) {
    const chainApi = await this.substrateApi.isReady;
    const bnAmount = new BN(amount);

    return chainApi.api.tx.dappStaking.unlock(bnAmount);
  }

  // todo: add buttion to cancel unlock
  async handleCancelUnlock () {
    const chainApi = await this.substrateApi.isReady;

    return chainApi.api.tx.dappStaking.relockUnlocking();
  }

  /* Handle unlock action */

  /* Other action */

  // only has cancel unlock
  override async handleYieldCancelUnstake (params: StakeCancelWithdrawalParams): Promise<TransactionData> {
    return Promise.reject(new TransactionError(BasicTxErrorType.UNSUPPORTED));
  }

  async handleYieldWithdraw (address: string, unstakingInfo: UnstakingInfo): Promise<TransactionData> {
    const chainApi = await this.substrateApi.isReady;

    return chainApi.api.tx.dappsStaking.withdrawUnbonded();
  }

  override async handleYieldClaimReward (address: string, bondReward?: boolean) {
    /*
    1. Get number of claim staker reward extrinsics
    2. Get all claim bonus reward extrinsics
    */
    const chainApi = await this.substrateApi.isReady;

    const allClaimRewardTxs: SubmittableExtrinsic[] = [];

    const eraRewardSpanLength = chainApi.api.consts.dappStaking.eraRewardSpanLength as unknown as number;
    const rewardRetentionInPeriods = chainApi.api.consts.dappStaking.rewardRetentionInPeriods as unknown as number;

    const [_stakedInfo, _ledger, _periodEnd, _activeProtocolState] = await Promise.all([
      chainApi.api.query.dappStaking.stakerInfo.entries(address),
      chainApi.api.query.dappStaking.ledger(address),
      chainApi.api.query.dappStaking.periodEnd.entries(),
      chainApi.api.query.dappStaking.activeProtocolState()
    ]);

    const ledger = _ledger.toPrimitive() as unknown as PalletDappStakingV3AccountLedger;
    const staked = ledger.staked;
    const stakedFuture = ledger.stakedFuture;
    const earnRewardPeriod = staked.period || stakedFuture.period;

    const isHasStaked = isHasStakedCheck(staked);
    const isHasStakedFuture = isHasStakedFutureCheck(stakedFuture);

    if (isHasStaked || isHasStakedFuture) {
      let firstEra = 0;
      let lastEra = 0;
      let numberClaims = 0;

      const activeProtocolState = _activeProtocolState.toPrimitive() as unknown as PalletDappStakingV3ProtocolState;
      const currentPeriod = activeProtocolState.periodInfo.number;
      const currentEra = parseInt(activeProtocolState.era);

      // todo: there 3 cases: reward expired, reward are in the past period, reward are in the ongoing period. Check case reward expired
      if (currentPeriod === earnRewardPeriod) {
        firstEra = isHasStaked ? staked.era : isHasStakedFuture ? stakedFuture.era : 0;
        lastEra = currentEra - 1;
      } else if (currentPeriod > earnRewardPeriod && currentPeriod - earnRewardPeriod <= rewardRetentionInPeriods) {
        const oldestPeriod = currentPeriod - rewardRetentionInPeriods;
        const previousOldestPeriodEndInfo = getPeriodEndInfo(oldestPeriod - 1, _periodEnd);

        firstEra = isHasStaked ? staked.era : stakedFuture.era;
        lastEra = parseInt(previousOldestPeriodEndInfo.finalEra);
      }

      if (firstEra && lastEra) {
        const firstSpanIndex = (firstEra - (firstEra % eraRewardSpanLength)) / eraRewardSpanLength;
        const lastSpanIndex = (lastEra - (lastEra % eraRewardSpanLength)) / eraRewardSpanLength;

        numberClaims = lastSpanIndex - firstSpanIndex + 1;
      }

      for (let i = 0; i < numberClaims; i++) {
        const claimTx = chainApi.api.tx.dappStaking.claimStakerRewards();

        allClaimRewardTxs.push(claimTx);
      }
    }

    if (_stakedInfo.length > 0) {
      for (const item of _stakedInfo) {
        // todo: optimize by check a stake amount in build and earn period/check bonus reward available
        const addressInfo = item[0].toHuman() as any[];
        const stakeInfo = item[1].toPrimitive() as unknown as PalletDappStakingV3SingularStakingInfo;
        const voting = stakeInfo.staked.voting;
        const isLoyalStaker = stakeInfo.loyalStaker;

        if (voting && isLoyalStaker) {
          const stakedDapp = addressInfo[1] as Record<string, string>;
          const dappParam = isEthereumAddress(stakedDapp.Evm) ? { Evm: stakedDapp.Evm.toLowerCase() } : { Wasm: stakedDapp.Wasm };

          const claimBonusTx = chainApi.api.tx.dappStaking.claimBonusReward(dappParam);

          allClaimRewardTxs.push(claimBonusTx);
        }
      }
    }

    // todo: if claim action always available, handle case there's nothing to claim.
    return chainApi.api.tx.utility.batch(allClaimRewardTxs);
  }

  // todo: add button to cleanupExpiredStake
  async handleCleanupExpiredStake (): Promise<TransactionData> {
    const chainApi = await this.substrateApi.isReady;

    return chainApi.api.tx.dappStaking.cleanupExpiredEnntries();
  }
  /* Other actions */
}
