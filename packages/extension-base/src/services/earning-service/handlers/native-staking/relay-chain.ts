// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { _ChainInfo } from '@subwallet/chain-list/types';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType, ExtrinsicType, NominationInfo, StakingTxErrorType, UnstakingInfo } from '@subwallet/extension-base/background/KoniTypes';
import { calculateAlephZeroValidatorReturn, calculateChainStakedReturnV2, calculateInflation, calculateTernoaValidatorReturn, calculateValidatorStakedReturn, getAvgValidatorEraReward, getCommission, getMaxValidatorErrorMessage, getMinStakeErrorMessage, getSupportedDaysByHistoryDepth, getTopValidatorByPoints, getValidatorPointsMap } from '@subwallet/extension-base/koni/api/staking/bonding/utils';
import { _STAKING_ERA_LENGTH_MAP } from '@subwallet/extension-base/services/chain-service/constants';
import { _SubstrateApi } from '@subwallet/extension-base/services/chain-service/types';
import { _getChainSubstrateAddressPrefix } from '@subwallet/extension-base/services/chain-service/utils';
import { _STAKING_CHAIN_GROUP, MaxEraRewardPointsEras } from '@subwallet/extension-base/services/earning-service/constants';
import { parseIdentity } from '@subwallet/extension-base/services/earning-service/utils';
import { BaseYieldPositionInfo, EarningStatus, NativeYieldPoolInfo, OptimalYieldPath, PalletStakingActiveEraInfo, PalletStakingEraRewardPoints, PalletStakingExposure, PalletStakingExposureItem, PalletStakingNominations, PalletStakingStakingLedger, PalletStakingValidatorPrefs, SpStakingExposurePage, StakeCancelWithdrawalParams, SubmitJoinNativeStaking, SubmitYieldJoinData, TernoaStakingRewardsStakingRewardsData, TransactionData, UnstakingStatus, ValidatorExtraInfo, ValidatorInfo, YieldPoolInfo, YieldPositionInfo, YieldTokenBaseInfo } from '@subwallet/extension-base/types';
import { balanceFormatter, formatNumber, reformatAddress } from '@subwallet/extension-base/utils';
import BigN from 'bignumber.js';
import { t } from 'i18next';

import { SubmittableExtrinsic } from '@polkadot/api/types';
import { UnsubscribePromise } from '@polkadot/api-base/types/base';
import { DeriveSessionProgress } from '@polkadot/api-derive/types';
import { Codec } from '@polkadot/types/types';
import { BN, BN_ZERO } from '@polkadot/util';

import BaseNativeStakingPoolHandler from './base';

export default class RelayNativeStakingPoolHandler extends BaseNativeStakingPoolHandler {
  /* Subscribe pool info */

  async subscribePoolInfo (callback: (data: YieldPoolInfo) => void): Promise<VoidFunction> {
    let cancel = false;
    const substrateApi = this.substrateApi;
    const chainInfo = this.chainInfo;
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

    await substrateApi.isReady;

    const unsub = await (substrateApi.api.query.staking?.currentEra(async (_currentEra: Codec) => {
      if (cancel) {
        unsub();

        return;
      }

      let maxNominations = substrateApi.api.consts.staking?.maxNominations?.toString() || '16';
      const _maxNominationsByNominationQuota = await substrateApi.api.call.stakingApi?.nominationsQuota(0); // todo: review param. Currently return constant for all param.
      const maxNominationsByNominationQuota = _maxNominationsByNominationQuota?.toString();

      maxNominations = maxNominationsByNominationQuota ?? maxNominations;

      const currentEra = _currentEra.toString();
      const maxUnlockingChunks = substrateApi.api.consts.staking.maxUnlockingChunks.toString();
      const unlockingEras = substrateApi.api.consts.staking.bondingDuration.toString();

      const maxSupportedEras = substrateApi.api.consts.staking.historyDepth.toString();
      const erasPerDay = 24 / _STAKING_ERA_LENGTH_MAP[chainInfo.slug]; // Can be exactly calculate from babe.epochDuration * blockTime * staking.sessionsPerEra

      const supportedDays = getSupportedDaysByHistoryDepth(erasPerDay, parseInt(maxSupportedEras), parseInt(currentEra) / erasPerDay);

      const startEra = parseInt(currentEra) - supportedDays * erasPerDay;

      const [_EraStakeInfo, _totalIssuance, _auctionCounter, _minNominatorBond, _counterForNominators, _minimumActiveStake, ..._eraReward] = await Promise.all([
        substrateApi.api.query.staking.erasTotalStake.multi([parseInt(currentEra), parseInt(currentEra) - 1]),
        substrateApi.api.query.balances.totalIssuance(),
        substrateApi.api.query.auctions?.auctionCounter(),
        substrateApi.api.query.staking.minNominatorBond(),
        substrateApi.api.query.staking.counterForNominators(),
        substrateApi.api.query?.staking?.minimumActiveStake && substrateApi.api.query?.staking?.minimumActiveStake(),
        substrateApi.api.query.staking.erasValidatorReward.multi([...Array(supportedDays).keys()].map((i) => i + startEra))
      ]);
      const [_totalEraStake, _lastTotalStaked] = _EraStakeInfo;
      const validatorEraReward = getAvgValidatorEraReward(supportedDays, _eraReward[0]);
      const lastTotalStaked = _lastTotalStaked.toString();

      const minActiveStake = _minimumActiveStake?.toString() || '0';
      const minNominatorBond = _minNominatorBond.toString();

      const bnMinActiveStake = new BN(minActiveStake);
      const bnMinNominatorBond = new BN(minNominatorBond);

      const minStake = bnMinActiveStake.gt(bnMinNominatorBond) ? bnMinActiveStake : bnMinNominatorBond;
      const rawTotalEraStake = _totalEraStake.toString();
      const rawTotalIssuance = _totalIssuance.toString();

      const numAuctions = _auctionCounter ? _auctionCounter.toHuman() as number : 0;
      const bnTotalEraStake = new BN(rawTotalEraStake);
      const bnTotalIssuance = new BN(rawTotalIssuance);

      const inflation = calculateInflation(bnTotalEraStake, bnTotalIssuance, numAuctions, chainInfo.slug);
      const expectedReturn = calculateChainStakedReturnV2(chainInfo, rawTotalIssuance, erasPerDay, lastTotalStaked, validatorEraReward, true);
      const eraTime = _STAKING_ERA_LENGTH_MAP[chainInfo.slug] || _STAKING_ERA_LENGTH_MAP.default; // in hours
      const unlockingPeriod = parseInt(unlockingEras) * eraTime; // in hours
      const farmerCount = _counterForNominators.toPrimitive() as number;

      const minToHuman = formatNumber(minStake.toString(), nativeToken.decimals || 0, balanceFormatter);

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
              slug: this.nativeToken.slug,
              apy: expectedReturn
            }
          ],
          maxCandidatePerFarmer: parseInt(maxNominations),
          maxWithdrawalRequestPerFarmer: parseInt(maxUnlockingChunks), // TODO recheck
          earningThreshold: {
            join: minStake.toString(),
            defaultUnstake: '0',
            fastUnstake: '0'
          },
          farmerCount: farmerCount,
          era: parseInt(currentEra),
          eraTime,
          tvl: bnTotalEraStake.toString(), // TODO recheck
          totalApy: expectedReturn, // TODO recheck
          unstakingPeriod: unlockingPeriod,
          inflation: inflation
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

  async parseNominatorMetadata (chainInfo: _ChainInfo, address: string, substrateApi: _SubstrateApi, ledger: PalletStakingStakingLedger, currentEra: string, minStake: BN, _deriveSessionProgress: DeriveSessionProgress): Promise<Omit<YieldPositionInfo, keyof BaseYieldPositionInfo>> {
    const chain = chainInfo.slug;

    const [_nominations, _bonded, _activeEra] = await Promise.all([
      substrateApi.api.query?.staking?.nominators(address),
      substrateApi.api.query?.staking?.bonded(address),
      substrateApi.api.query?.staking?.activeEra()
    ]);
    const unlimitedNominatorRewarded = substrateApi.api.consts.staking.maxExposurePageSize !== undefined;
    const _maxNominatorRewardedPerValidator = (substrateApi.api.consts.staking.maxNominatorRewardedPerValidator || 0).toString();
    const maxNominatorRewardedPerValidator = parseInt(_maxNominatorRewardedPerValidator);
    const nominations = _nominations.toPrimitive() as unknown as PalletStakingNominations;
    const bonded = _bonded.toHuman();

    const activeStake = ledger.active.toString();
    const totalStake = ledger.total.toString();
    const unstakingBalance = (ledger.total - ledger.active).toString();
    const nominationList: NominationInfo[] = [];
    const unstakingList: UnstakingInfo[] = [];

    if (nominations) {
      const validatorList = nominations.targets;

      await Promise.all(validatorList.map(async (validatorAddress) => {
        let nominationStatus = EarningStatus.NOT_EARNING;
        let eraStakerOtherList: PalletStakingExposureItem[] = [];
        let identity;

        if (['kusama', 'polkadot', 'westend', 'availTuringTest', 'avail_mainnet'].includes(this.chain)) { // todo: review all relaychains later
          const [[_identity], _eraStaker] = await Promise.all([
            parseIdentity(substrateApi, validatorAddress),
            substrateApi.api.query.staking.erasStakersPaged.entries(currentEra, validatorAddress)
          ]);

          identity = _identity;
          eraStakerOtherList = _eraStaker.flatMap((paged) => (paged[1].toPrimitive() as unknown as SpStakingExposurePage).others);
        } else {
          const [[_identity], _eraStaker] = await Promise.all([
            parseIdentity(substrateApi, validatorAddress),
            substrateApi.api.query.staking.erasStakers(currentEra, validatorAddress)
          ]);

          identity = _identity;
          const eraStaker = _eraStaker.toPrimitive() as unknown as PalletStakingExposure;

          eraStakerOtherList = eraStaker.others;
        }

        const sortedNominators = eraStakerOtherList
          .sort((a, b) => {
            return new BigN(b.value).minus(a.value).toNumber();
          })
        ;
        const topNominators = sortedNominators
          .map((nominator) => {
            return nominator.who;
          })
        ;

        if (!topNominators.includes(reformatAddress(address, _getChainSubstrateAddressPrefix(chainInfo)))) { // if nominator has target but not in nominator list
          nominationStatus = EarningStatus.WAITING;
        } else if (topNominators.slice(0, unlimitedNominatorRewarded ? undefined : maxNominatorRewardedPerValidator).includes(reformatAddress(address, _getChainSubstrateAddressPrefix(chainInfo)))) { // if address in top nominators
          nominationStatus = EarningStatus.EARNING_REWARD;
        }

        nominationList.push({
          chain,
          validatorAddress,
          status: nominationStatus,
          validatorIdentity: identity,
          activeStake: '0' // relaychain allocates stake accordingly
        } as NominationInfo);
      }));
    }

    let stakingStatus = EarningStatus.NOT_EARNING;
    const bnActiveStake = new BN(activeStake);
    let waitingNominationCount = 0;

    if (bnActiveStake.gte(minStake) && bnActiveStake.gt(BN_ZERO)) {
      for (const nomination of nominationList) {
        if (nomination.status === EarningStatus.EARNING_REWARD) { // only need 1 earning nomination to count
          stakingStatus = EarningStatus.EARNING_REWARD;
        } else if (nomination.status === EarningStatus.WAITING) {
          waitingNominationCount += 1;
        }
      }

      if (waitingNominationCount === nominationList.length) {
        stakingStatus = EarningStatus.WAITING;
      }
    }

    ledger.unlocking.forEach((unlockingChunk) => {
      const activeEra = _activeEra.toPrimitive() as unknown as PalletStakingActiveEraInfo;
      const era = parseInt(activeEra.index);
      const startTimestampMs = parseInt(activeEra.start);

      const remainingEra = unlockingChunk.era - era;
      const eraTime = _STAKING_ERA_LENGTH_MAP[chainInfo.slug] || _STAKING_ERA_LENGTH_MAP.default; // in hours
      const remaningTimestampMs = remainingEra * eraTime * 60 * 60 * 1000;
      const targetTimestampMs = startTimestampMs + remaningTimestampMs;
      const isClaimable = targetTimestampMs - Date.now() <= 0;

      unstakingList.push({
        chain,
        status: isClaimable ? UnstakingStatus.CLAIMABLE : UnstakingStatus.UNLOCKING,
        claimable: unlockingChunk.value.toString(),
        targetTimestampMs: targetTimestampMs
      } as UnstakingInfo);
    });

    return {
      status: stakingStatus,
      balanceToken: this.nativeToken.slug,
      totalStake: totalStake,
      activeStake: activeStake,
      unstakeBalance: unstakingBalance,
      isBondedBefore: bonded !== null,
      nominations: nominationList,
      unstakings: unstakingList
    };
  }

  async subscribePoolPosition (useAddresses: string[], resultCallback: (rs: YieldPositionInfo) => void): Promise<VoidFunction> {
    let cancel = false;
    const substrateApi = await this.substrateApi.isReady;
    const defaultInfo = this.baseInfo;
    const chainInfo = this.chainInfo;

    const unsub = await substrateApi.api.query.staking?.ledger.multi(useAddresses, async (ledgers: Codec[]) => {
      if (cancel) {
        unsub();

        return;
      }

      if (ledgers) {
        const [_currentEra, _minimumActiveStake, _minNominatorBond, _deriveSessionProgress] = await Promise.all([
          substrateApi.api.query?.staking?.currentEra(),
          substrateApi.api.query?.staking?.minimumActiveStake && substrateApi.api.query?.staking?.minimumActiveStake(),
          substrateApi.api.query?.staking?.minNominatorBond(),
          substrateApi.api.derive?.session?.progress()
        ]);

        const currentEra = _currentEra.toString();
        const minActiveStake = _minimumActiveStake?.toString() || '0';
        const minNominatorBond = _minNominatorBond.toString();
        const bnMinActiveStake = new BN(minActiveStake);
        const bnMinNominatorBond = new BN(minNominatorBond);
        const minStake = bnMinActiveStake.gt(bnMinNominatorBond) ? bnMinActiveStake : bnMinNominatorBond;

        await Promise.all(ledgers.map(async (_ledger: Codec, i) => {
          const owner = reformatAddress(useAddresses[i], 42);
          const ledger = _ledger.toPrimitive() as unknown as PalletStakingStakingLedger;

          if (ledger) {
            const nominatorMetadata = await this.parseNominatorMetadata(chainInfo, owner, substrateApi, ledger, currentEra, minStake, _deriveSessionProgress);

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
              balanceToken: this.nativeToken.slug,
              address: owner,
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
    const decimals = this.nativeToken.decimals || 0;

    const chainApi = await this.substrateApi.isReady;
    const poolInfo = await this.getPoolInfo();

    if (!poolInfo || !poolInfo.statistic) {
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
    }

    const [_era, _activeEraInfo] = await Promise.all([
      chainApi.api.query.staking.currentEra(),
      chainApi.api.query.staking.activeEra()
    ]);

    const currentEra = _era.toString();
    const activeEraInfo = _activeEraInfo.toPrimitive() as unknown as PalletStakingActiveEraInfo;
    const activeEra = activeEraInfo.index;

    const allValidators: string[] = [];
    const validatorInfoList: ValidatorInfo[] = [];

    const maxEraRewardPointsEras = MaxEraRewardPointsEras;
    const endEraForPoints = parseInt(activeEra) - 1;
    let startEraForPoints = Math.max(endEraForPoints - maxEraRewardPointsEras + 1, 0);

    let _eraStakersPromise;

    if (['kusama', 'polkadot', 'westend', 'availTuringTest', 'avail_mainnet'].includes(this.chain)) { // todo: review all relaychains later
      _eraStakersPromise = chainApi.api.query.staking.erasStakersOverview.entries(parseInt(currentEra));
    } else {
      _eraStakersPromise = chainApi.api.query.staking.erasStakers.entries(parseInt(currentEra));
    }

    const [_totalEraStake, _eraStakers, _minBond, _stakingRewards, _validators, ..._eraRewardPoints] = await Promise.all([
      chainApi.api.query.staking.erasTotalStake(parseInt(currentEra)),
      _eraStakersPromise,
      chainApi.api.query.staking.minNominatorBond(),
      chainApi.api.query.stakingRewards?.data && chainApi.api.query.stakingRewards.data(),
      chainApi.api.query.staking.validators.entries(),
      chainApi.api.query.staking.erasRewardPoints.multi([...Array(maxEraRewardPointsEras).keys()].map((i) => i + startEraForPoints))
    ]);

    const eraRewardMap: Record<string, PalletStakingEraRewardPoints> = {};

    for (const item of _eraRewardPoints[0]) {
      eraRewardMap[startEraForPoints] = item.toHuman() as unknown as PalletStakingEraRewardPoints;
      startEraForPoints++;
    }

    const validatorPointsMap = getValidatorPointsMap(eraRewardMap);
    const topValidatorList = getTopValidatorByPoints(validatorPointsMap);

    // filter blocked validators
    const validators = _validators as any[];
    const blockValidatorList: string[] = [];

    for (const validator of validators) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      const validatorAddress = validator[0].toHuman()[0] as string;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      const validatorPrefs = validator[1].toHuman() as unknown as PalletStakingValidatorPrefs;

      const isBlocked = validatorPrefs.blocked;

      if (isBlocked) {
        blockValidatorList.push(validatorAddress);
      }
    }

    const stakingRewards = _stakingRewards?.toPrimitive() as unknown as TernoaStakingRewardsStakingRewardsData;

    const unlimitedNominatorRewarded = chainApi.api.consts.staking.maxExposurePageSize !== undefined;
    const maxNominatorRewarded = (chainApi.api.consts.staking.maxNominatorRewardedPerValidator || 0).toString();
    const bnTotalEraStake = new BN(_totalEraStake.toString());

    const rawMinBond = _minBond.toHuman() as string;
    const minBond = rawMinBond.replaceAll(',', '');

    const totalStakeMap: Record<string, BN> = {};
    const bnDecimals = new BN((10 ** decimals).toString());

    const eraStakers = _eraStakers as unknown as any[];

    for (const item of eraStakers) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      const rawValidatorInfo = item[0].toHuman() as any[];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
      const rawValidatorStat = item[1].toHuman() as Record<string, any>;

      const validatorAddress = rawValidatorInfo[1] as string;

      if (!blockValidatorList.includes(validatorAddress)) {
        let isTopQuartile = false;

        if (topValidatorList.includes(validatorAddress)) {
          isTopQuartile = true;
        }

        const rawTotalStake = rawValidatorStat.total as string;
        const rawOwnStake = rawValidatorStat.own as string;

        const bnTotalStake = new BN(rawTotalStake.replaceAll(',', ''));
        const bnOwnStake = new BN(rawOwnStake.replaceAll(',', ''));
        const otherStake = bnTotalStake.sub(bnOwnStake);

        totalStakeMap[validatorAddress] = bnTotalStake;

        let nominatorCount = 0;

        if ('others' in rawValidatorStat) {
          const others = rawValidatorStat.others as Record<string, any>[];

          nominatorCount = others.length;
        }

        allValidators.push(validatorAddress);

        validatorInfoList.push({
          address: validatorAddress,
          totalStake: bnTotalStake.toString(),
          ownStake: bnOwnStake.toString(),
          otherStake: otherStake.toString(),
          nominatorCount,
          // to be added later
          commission: 0,
          expectedReturn: 0,
          blocked: false,
          isVerified: false,
          minBond,
          isCrowded: unlimitedNominatorRewarded ? false : nominatorCount > parseInt(maxNominatorRewarded),
          eraRewardPoint: (validatorPointsMap[validatorAddress] ?? BN_ZERO).toString(),
          topQuartile: isTopQuartile
        } as ValidatorInfo);
      }
    }

    const extraInfoMap: Record<string, ValidatorExtraInfo> = {};

    await Promise.all(allValidators.map(async (address) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [_commissionInfo, [identity, isVerified]] = await Promise.all([
        chainApi.api.query.staking.validators(address),
        parseIdentity(chainApi, address)
      ]);

      const commissionInfo = _commissionInfo.toHuman() as Record<string, any>;

      extraInfoMap[address] = {
        commission: commissionInfo.commission as string,
        blocked: commissionInfo.blocked as boolean,
        identity,
        isVerified: isVerified
      } as ValidatorExtraInfo;
    }));

    const bnAvgStake = bnTotalEraStake.divn(validatorInfoList.length).div(bnDecimals);

    for (const validator of validatorInfoList) {
      const commission = extraInfoMap[validator.address].commission;

      const bnValidatorStake = totalStakeMap[validator.address].div(bnDecimals);

      if (_STAKING_CHAIN_GROUP.aleph.includes(this.chain)) {
        validator.expectedReturn = calculateAlephZeroValidatorReturn(poolInfo.statistic.totalApy as number, getCommission(commission));
      } else if (_STAKING_CHAIN_GROUP.ternoa.includes(this.chain)) {
        const rewardPerValidator = new BN(stakingRewards.sessionExtraRewardPayout).divn(allValidators.length).div(bnDecimals);
        const validatorStake = totalStakeMap[validator.address].div(bnDecimals).toNumber();

        validator.expectedReturn = calculateTernoaValidatorReturn(rewardPerValidator.toNumber(), validatorStake, getCommission(commission));
      } else {
        validator.expectedReturn = calculateValidatorStakedReturn(poolInfo.statistic.totalApy as number, bnValidatorStake, bnAvgStake, getCommission(commission));
      }

      validator.commission = parseFloat(commission.split('%')[0]);
      validator.blocked = extraInfoMap[validator.address].blocked;
      validator.identity = extraInfoMap[validator.address].identity;
      validator.isVerified = extraInfoMap[validator.address].isVerified;
    }

    return validatorInfoList;
  }

  /* Get pool targets */

  /* Join pool action */

  async validateYieldJoin (data: SubmitYieldJoinData, path: OptimalYieldPath): Promise<TransactionError[]> {
    const { address, amount, selectedValidators } = data as SubmitJoinNativeStaking;
    const _poolInfo = await this.getPoolInfo();
    const poolPosition = await this.getPoolPosition(address);
    const chainInfo = this.chainInfo;
    const bnAmount = new BN(amount);

    if (bnAmount.lte(BN_ZERO)) {
      return Promise.resolve([new TransactionError(BasicTxErrorType.INVALID_PARAMS, 'Amount must be greater than 0')]);
    }

    if (!_poolInfo) {
      return Promise.resolve([new TransactionError(BasicTxErrorType.INTERNAL_ERROR)]);
    }

    const poolInfo = _poolInfo as NativeYieldPoolInfo;

    if (!poolInfo.statistic) {
      return Promise.resolve([new TransactionError(BasicTxErrorType.INTERNAL_ERROR)]);
    }

    const errors: TransactionError[] = [];
    let bnTotalStake = new BN(amount);
    const bnMinStake = new BN(poolInfo.statistic.earningThreshold.join);
    const minStakeErrorMessage = getMinStakeErrorMessage(chainInfo, bnMinStake);
    const maxValidatorErrorMessage = getMaxValidatorErrorMessage(chainInfo, poolInfo.statistic.maxCandidatePerFarmer);

    if (!poolPosition || poolPosition.status === EarningStatus.NOT_STAKING) {
      if (!bnTotalStake.gte(bnMinStake)) {
        errors.push(new TransactionError(StakingTxErrorType.NOT_ENOUGH_MIN_STAKE, minStakeErrorMessage));
      }

      if (selectedValidators.length > poolInfo.statistic.maxCandidatePerFarmer) {
        errors.push(new TransactionError(StakingTxErrorType.EXCEED_MAX_NOMINATIONS, maxValidatorErrorMessage));
      }

      return errors;
    }

    const bnCurrentActiveStake = new BN(poolPosition.activeStake);

    bnTotalStake = bnTotalStake.add(bnCurrentActiveStake);

    if (!bnTotalStake.gte(bnMinStake)) {
      errors.push(new TransactionError(StakingTxErrorType.NOT_ENOUGH_MIN_STAKE, minStakeErrorMessage));
    }

    if (selectedValidators.length > poolInfo.statistic.maxCandidatePerFarmer) {
      errors.push(new TransactionError(StakingTxErrorType.EXCEED_MAX_NOMINATIONS, maxValidatorErrorMessage));
    }

    return errors;
  }

  async createJoinExtrinsic (data: SubmitJoinNativeStaking, positionInfo?: YieldPositionInfo, bondDest = 'Staked'): Promise<[TransactionData, YieldTokenBaseInfo]> {
    const { address, amount, selectedValidators: targetValidators } = data;
    const chainApi = await this.substrateApi.isReady;
    const binaryAmount = new BN(amount);
    const tokenSlug = this.nativeToken.slug;

    let bondTx: SubmittableExtrinsic<'promise'> | undefined;
    let nominateTx: SubmittableExtrinsic<'promise'> | undefined;

    const _params = chainApi.api.tx.staking.bond.toJSON() as Record<string, any>;
    const paramsCount = (_params.args as any[]).length;

    const validatorParamList = targetValidators.map((validator) => {
      return validator.address;
    });

    // eslint-disable-next-line @typescript-eslint/require-await
    const compoundTransactions = async (bondTx: SubmittableExtrinsic<'promise'>, nominateTx: SubmittableExtrinsic<'promise'>): Promise<[TransactionData, YieldTokenBaseInfo]> => {
      const extrinsic = chainApi.api.tx.utility.batchAll([bondTx, nominateTx]);
      // const fees = await Promise.all([bondTx.paymentInfo(address), nominateTx.paymentInfo(address)]);
      // const totalFee = fees.reduce((previousValue, currentItem) => {
      //   const fee = currentItem.toPrimitive() as unknown as RuntimeDispatchInfo;
      //
      //   return previousValue + fee.partialFee;
      // }, 0);

      // Not use the fee to validate and to display on UI
      return [extrinsic, { slug: tokenSlug, amount: '0' }];
    };

    if (!positionInfo) {
      if (paramsCount === 2) {
        bondTx = chainApi.api.tx.staking.bond(binaryAmount, bondDest);
      } else {
        bondTx = chainApi.api.tx.staking.bond(address, binaryAmount, bondDest);
      }

      nominateTx = chainApi.api.tx.staking.nominate(validatorParamList);

      return compoundTransactions(bondTx, nominateTx);
    }

    if (!positionInfo.isBondedBefore) { // first time
      if (paramsCount === 2) {
        bondTx = chainApi.api.tx.staking.bond(binaryAmount, bondDest);
      } else {
        bondTx = chainApi.api.tx.staking.bond(address, binaryAmount, bondDest);
      }

      nominateTx = chainApi.api.tx.staking.nominate(validatorParamList);

      return compoundTransactions(bondTx, nominateTx);
    } else {
      if (binaryAmount.gt(BN_ZERO)) {
        bondTx = chainApi.api.tx.staking.bondExtra(binaryAmount);
      }

      if (positionInfo.isBondedBefore && targetValidators.length > 0) {
        nominateTx = chainApi.api.tx.staking.nominate(validatorParamList);
      }
    }

    if (bondTx && !nominateTx) {
      // const feeInfo = await bondTx.paymentInfo(address);
      // const fee = feeInfo.toPrimitive() as unknown as RuntimeDispatchInfo;

      return [bondTx, { slug: tokenSlug, amount: '0' }];
    } else if (nominateTx && !bondTx) {
      // const feeInfo = await nominateTx.paymentInfo(address);
      // const fee = feeInfo.toPrimitive() as unknown as RuntimeDispatchInfo;

      return [nominateTx, { slug: tokenSlug, amount: '0' }];
    }

    if (bondTx && nominateTx) {
      return compoundTransactions(bondTx, nominateTx);
    } else {
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
    }
  }

  /* Join pool action */

  /* Leave pool action */

  async validateYieldLeave (amount: string, address: string, fastLeave: boolean, selectedTarget?: string): Promise<TransactionError[]> {
    const errors: TransactionError[] = [];

    const poolInfo = await this.getPoolInfo();
    const poolPosition = await this.getPoolPosition(address);

    if (!poolInfo || !poolInfo.statistic || !poolPosition || fastLeave) {
      return [new TransactionError(BasicTxErrorType.INTERNAL_ERROR)];
    }

    if (fastLeave) {
      return [new TransactionError(BasicTxErrorType.INVALID_PARAMS)];
    }

    const bnAmount = new BN(amount);

    if (bnAmount.lte(BN_ZERO)) {
      errors.push(new TransactionError(BasicTxErrorType.INVALID_PARAMS, t('Amount must be greater than 0')));
    }

    const bnActiveStake = new BN(poolPosition.activeStake);
    const bnRemainingStake = bnActiveStake.sub(new BN(amount));
    const minStake = new BN(poolInfo.statistic.earningThreshold.join || '0');
    const maxUnstake = poolInfo.statistic.maxWithdrawalRequestPerFarmer;

    if (!(bnRemainingStake.isZero() || bnRemainingStake.gte(minStake))) {
      errors.push(new TransactionError(StakingTxErrorType.INVALID_ACTIVE_STAKE));
    }

    if (poolPosition.unstakings.length > maxUnstake) {
      errors.push(new TransactionError(StakingTxErrorType.EXCEED_MAX_UNSTAKING, t('You cannot unstake more than {{number}} times', { replace: { number: maxUnstake } })));
    }

    return Promise.resolve(errors);
  }

  async handleYieldUnstake (amount: string, address: string, selectedTarget?: string): Promise<[ExtrinsicType, TransactionData]> {
    const chainApi = await this.substrateApi.isReady;
    const poolPosition = await this.getPoolPosition(address);

    if (!poolPosition) {
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
    }

    let extrinsic: TransactionData;
    const binaryAmount = new BN(amount);

    const isUnstakeAll = amount === poolPosition.activeStake;

    if (isUnstakeAll) {
      const chillTx = chainApi.api.tx.staking.chill();
      const unbondTx = chainApi.api.tx.staking.unbond(binaryAmount);

      extrinsic = chainApi.api.tx.utility.batchAll([chillTx, unbondTx]);
    } else {
      extrinsic = chainApi.api.tx.staking.unbond(binaryAmount);
    }

    return [ExtrinsicType.STAKING_LEAVE_POOL, extrinsic];
  }

  /* Leave pool action */

  /* Other action */

  async handleYieldCancelUnstake (params: StakeCancelWithdrawalParams): Promise<TransactionData> {
    const chainApi = await this.substrateApi.isReady;
    const { selectedUnstaking } = params;

    return chainApi.api.tx.staking.rebond(selectedUnstaking.claimable);
  }

  async handleYieldWithdraw (address: string, unstakingInfo: UnstakingInfo): Promise<TransactionData> {
    const chainApi = await this.substrateApi.isReady;

    if (chainApi.api.tx.staking.withdrawUnbonded.meta.args.length === 1) {
      const _slashingSpans = (await chainApi.api.query.staking.slashingSpans(address)).toHuman() as Record<string, any>;
      const slashingSpanCount = _slashingSpans !== null ? _slashingSpans.spanIndex as string : '0';

      return chainApi.api.tx.staking.withdrawUnbonded(slashingSpanCount);
    } else {
      return chainApi.api.tx.staking.withdrawUnbonded();
    }
  }

  /* Other actions */
}
