// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType } from '@subwallet/extension-base/background/KoniTypes';
import KoniState from '@subwallet/extension-base/koni/background/handlers/State';
import { _isChainEvmCompatible } from '@subwallet/extension-base/services/chain-service/utils';
import { _STAKING_CHAIN_GROUP } from '@subwallet/extension-base/services/earning-service/constants';
import BasePoolHandler from '@subwallet/extension-base/services/earning-service/handlers/base';
import InterlayLendingPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/lending/interlay';
import AcalaLiquidStakingPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/liquid-staking/acala';
import BifrostLiquidStakingPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/liquid-staking/bifrost';
import ParallelLiquidStakingPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/liquid-staking/parallel';
import NominationPoolHandler from '@subwallet/extension-base/services/earning-service/handlers/nomination-pool';
import { HandleYieldStepData, HandleYieldStepParams, OptimalYieldPath, OptimalYieldPathParams, ValidateYieldProcessParams, YieldPoolInfo, YieldPoolTarget, YieldPositionInfo } from '@subwallet/extension-base/types';
import { categoryAddresses } from '@subwallet/extension-base/utils';

export default class EarningService {
  protected readonly state: KoniState;
  protected handlers: Record<string, BasePoolHandler> = {};

  constructor (state: KoniState) {
    this.state = state;

    this.initHandlers();
  }

  public initHandlers () {
    const chains = this.state.activeChainSlugs;

    for (const chain of chains) {
      if (!this.handlers[chain]) {
        if (_STAKING_CHAIN_GROUP.nominationPool.includes(chain)) {
          const handler = new NominationPoolHandler(this.state, chain);

          this.handlers[handler.slug] = handler;
        }

        if (_STAKING_CHAIN_GROUP.liquidStaking.includes(chain)) {
          let handler: BasePoolHandler | undefined;

          if (chain === 'bifrost_dot') {
            handler = new BifrostLiquidStakingPoolHandler(this.state, chain);
          }

          if (chain === 'acala') {
            handler = new AcalaLiquidStakingPoolHandler(this.state, chain);
          }

          if (chain === 'parallel') {
            handler = new ParallelLiquidStakingPoolHandler(this.state, chain);
          }

          if (handler) {
            this.handlers[handler.slug] = handler;
          }
        }

        if (_STAKING_CHAIN_GROUP.lending.includes(chain)) {
          let handler: BasePoolHandler | undefined;

          if (chain === 'interlay') {
            handler = new InterlayLendingPoolHandler(this.state, chain);
          }

          if (handler) {
            this.handlers[handler.slug] = handler;
          }
        }
      }
    }
  }

  public getPoolHandler (slug: string): BasePoolHandler | undefined {
    this.initHandlers();

    return this.handlers[slug];
  }

  public isPoolSupportAlternativeFee (slug: string): boolean {
    const handler = this.getPoolHandler(slug);

    if (handler) {
      return handler.isPoolSupportAlternativeFee;
    } else {
      throw new TransactionError(BasicTxErrorType.INTERNAL_ERROR);
    }
  }

  /* Subscribe pools' info */

  public async subscribePoolsInfo (callback: (rs: YieldPoolInfo) => void): Promise<VoidFunction> {
    let cancel = false;

    await this.state.eventService.waitChainReady;
    this.initHandlers();

    const activeChains = this.state.activeChainSlugs;
    const unsubList: Array<VoidFunction> = [];

    for (const handler of Object.values(this.handlers)) {
      if (activeChains.includes(handler.chain)) {
        handler.subscribePoolInfo(callback)
          .then((unsub) => {
            if (cancel) {
              unsub();
            } else {
              unsubList.push(unsub);
            }
          })
          .catch(console.error);
      }
    }

    return () => {
      cancel = true;
      unsubList.forEach((unsub) => {
        unsub?.();
      });
    };
  }

  /* Subscribe pools' info */

  /* Subscribe pools' position */

  public async subscribePoolPositions (addresses: string[], callback: (rs: YieldPositionInfo) => void): Promise<VoidFunction> {
    let cancel = false;

    await this.state.eventService.waitChainReady;
    this.initHandlers();

    const [substrateAddresses, evmAddresses] = categoryAddresses(addresses);
    const activeChains = this.state.activeChainSlugs;
    const unsubList: Array<VoidFunction> = [];

    for (const handler of Object.values(this.handlers)) {
      if (activeChains.includes(handler.chain)) {
        const chainInfo = handler.chainInfo;
        const useAddresses = _isChainEvmCompatible(chainInfo) ? evmAddresses : substrateAddresses;

        handler.subscribePoolPosition(useAddresses, callback)
          .then((unsub) => {
            if (cancel) {
              unsub();
            } else {
              unsubList.push(unsub);
            }
          })
          .catch(console.error);
      }
    }

    return () => {
      cancel = true;
      unsubList.forEach((unsub) => {
        unsub?.();
      });
    };
  }

  /* Subscribe pools' position */

  /* Get pools' reward */

  public async getPoolReward (addresses: string[]): Promise<VoidFunction> {
    let cancel = false;

    await this.state.eventService.waitChainReady;
    this.initHandlers();

    const [substrateAddresses, evmAddresses] = categoryAddresses(addresses);
    const activeChains = this.state.activeChainSlugs;
    const unsubList: Array<VoidFunction> = [];

    for (const handler of Object.values(this.handlers)) {
      if (activeChains.includes(handler.chain)) {
        const chainInfo = handler.chainInfo;
        const useAddresses = _isChainEvmCompatible(chainInfo) ? evmAddresses : substrateAddresses;

        handler.getPoolReward(useAddresses, console.debug)
          .then((unsub) => {
            if (cancel) {
              unsub();
            } else {
              unsubList.push(unsub);
            }
          })
          .catch(console.error);
      }
    }

    return () => {
      cancel = true;
      unsubList.forEach((unsub) => {
        unsub?.();
      });
    };
  }

  /* Get pools' reward */

  /* Get pool's targets */

  /**
   * @async
   * @function getPoolTargets
   * @param {string} slug - Pool's slug
   * @return {Promise<YieldPoolTarget[]>} List of pool's target
   * */
  public async getPoolTargets (slug: string): Promise<YieldPoolTarget[]> {
    await this.state.eventService.waitChainReady;

    const handler = this.getPoolHandler(slug);

    if (handler) {
      return await handler.getPoolTargets();
    } else {
      return [];
    }
  }

  /* Get pool's targets */

  /* Handle actions */

  /* Join */

  public async generateOptimalSteps (params: OptimalYieldPathParams): Promise<OptimalYieldPath> {
    await this.state.eventService.waitChainReady;

    const { slug } = params;
    const handler = this.getPoolHandler(slug);

    if (handler) {
      return handler.generateOptimalPath(params);
    } else {
      throw new TransactionError(BasicTxErrorType.INTERNAL_ERROR);
    }
  }

  public async validateYieldJoin (params: ValidateYieldProcessParams): Promise<TransactionError[]> {
    await this.state.eventService.waitChainReady;

    const { slug } = params.data;
    const handler = this.getPoolHandler(slug);

    if (handler) {
      return handler.validateYieldJoin(params.data, params.path);
    } else {
      return [new TransactionError(BasicTxErrorType.INTERNAL_ERROR)];
    }
  }

  public async handleYieldJoin (params: HandleYieldStepParams): Promise<HandleYieldStepData> {
    await this.state.eventService.waitChainReady;

    const { slug } = params.data;
    const handler = this.getPoolHandler(slug);

    if (handler) {
      return handler.handleYieldJoin(params.data, params.path, params.currentStep);
    } else {
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
    }
  }

  /* Join */

  /* Handle actions */
}