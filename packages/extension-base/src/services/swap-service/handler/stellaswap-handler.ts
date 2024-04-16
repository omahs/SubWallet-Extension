// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { COMMON_CHAIN_SLUGS } from '@subwallet/chain-list';
import { SwapError } from '@subwallet/extension-base/background/errors/SwapError';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType, ChainType, ExtrinsicType } from '@subwallet/extension-base/background/KoniTypes';
import { getEVMTransactionObject } from '@subwallet/extension-base/koni/api/tokens/evm/transfer';
import { BalanceService } from '@subwallet/extension-base/services/balance-service';
import { ChainService } from '@subwallet/extension-base/services/chain-service';
import { _getAssetDecimals, _getChainNativeTokenSlug, _getContractAddressOfToken, _isNativeToken, _isSmartContractToken } from '@subwallet/extension-base/services/chain-service/utils';
import { SwapBaseHandler, SwapBaseInterface } from '@subwallet/extension-base/services/swap-service/handler/base-handler';
import { calculateSwapRate, getEarlyHydradxValidationError, SWAP_QUOTE_TIMEOUT_MAP } from '@subwallet/extension-base/services/swap-service/utils';
import { BaseStepDetail } from '@subwallet/extension-base/types/service-base';
import { HydradxPreValidationMetadata, OptimalSwapPath, OptimalSwapPathParams, StellaswapPreValidationMetadata, SwapBaseTxData, SwapEarlyValidation, SwapErrorType, SwapFeeInfo, SwapFeeType, SwapProviderId, SwapQuote, SwapRequest, SwapStepType, SwapSubmitParams, SwapSubmitStepData, ValidateSwapProcessParams } from '@subwallet/extension-base/types/swap';
import BigNumber from 'bignumber.js';

export class StellaswapHandler implements SwapBaseInterface {
  private swapBaseHandler: SwapBaseHandler;
  isTestnet: boolean;

  constructor (chainService: ChainService, balanceService: BalanceService, isTestnet = true) { // todo: pass in baseHandler from service
    this.swapBaseHandler = new SwapBaseHandler({
      balanceService,
      chainService,
      providerName: isTestnet ? 'Stellaswap Testnet' : 'Stellaswap',
      providerSlug: isTestnet ? SwapProviderId.STELLASWAP_TESTNET : SwapProviderId.STELLASWAP_MAINNET
    });

    this.isTestnet = isTestnet;
  }

  get chain () {
    if (!this.isTestnet) {
      return COMMON_CHAIN_SLUGS.MOONBEAM;
    } else {
      return COMMON_CHAIN_SLUGS.MOONBASE;
    }
  }

  get chainService () {
    return this.swapBaseHandler.chainService;
  }

  get balanceService () {
    return this.swapBaseHandler.balanceService;
  }

  get providerInfo () {
    return this.swapBaseHandler.providerInfo;
  }

  get name () {
    return this.swapBaseHandler.name;
  }

  get slug () {
    return this.swapBaseHandler.slug;
  }

  generateOptimalProcess (params: OptimalSwapPathParams): Promise<OptimalSwapPath> {
    return this.swapBaseHandler.generateOptimalProcess(params, [
      this.getApproveStep,
      this.getSubmitStep
    ]);
  }

  getApproveStep (): Promise<[BaseStepDetail, SwapFeeInfo] | undefined> {
    return Promise.resolve(undefined);
  }

  async getSubmitStep (params: OptimalSwapPathParams): Promise<[BaseStepDetail, SwapFeeInfo] | undefined> {
    if (params.selectedQuote) {
      const submitStep = {
        name: 'Swap',
        type: SwapStepType.SWAP
      };

      return Promise.resolve([submitStep, params.selectedQuote.feeInfo]);
    }

    return Promise.resolve(undefined);
  }

  async getSwapQuote (request: SwapRequest): Promise<SwapQuote | SwapError> {
    const fromAsset = this.chainService.getAssetBySlug(request.pair.from);
    const toAsset = this.chainService.getAssetBySlug(request.pair.to);
    // const fromAssetAddress = _isNativeToken(fromAsset) ? 'ETH' : _getContractAddressOfToken(fromAsset);
    // const toAssetAddress = _isNativeToken(toAsset) ? 'ETH' : _getContractAddressOfToken(toAsset);

    const fromChain = this.chainService.getChainInfoByKey(fromAsset.originChain);
    const fromChainNativeTokenSlug = _getChainNativeTokenSlug(fromChain);

    const earlyValidation = await this.validateSwapRequest(request);

    if (earlyValidation.error) {
      const metadata = earlyValidation.metadata as HydradxPreValidationMetadata;

      return getEarlyHydradxValidationError(earlyValidation.error, metadata);
    }

    const rate = '428735510';
    const bnToAmount = new BigNumber(request.fromAmount).times(rate).div(10 ** _getAssetDecimals(fromAsset));
    const toAmount = bnToAmount.toString();

    return Promise.resolve({
      pair: request.pair,
      fromAmount: request.fromAmount,
      toAmount,
      rate: calculateSwapRate(request.fromAmount, toAmount.toString(), fromAsset, toAsset),
      provider: this.providerInfo,
      aliveUntil: +Date.now() + (SWAP_QUOTE_TIMEOUT_MAP[this.slug] || SWAP_QUOTE_TIMEOUT_MAP.default),
      feeInfo: {
        feeComponent: [
          {
            tokenSlug: fromChainNativeTokenSlug,
            amount: '10000000000000000',
            feeType: SwapFeeType.NETWORK_FEE
          },
          {
            tokenSlug: toAsset.slug, // fee is subtracted from receiving amount
            amount: '20000000',
            feeType: SwapFeeType.PLATFORM_FEE
          }
        ],
        defaultFeeToken: fromChainNativeTokenSlug,
        feeOptions: [fromChainNativeTokenSlug] // todo: parse fee options
      },
      isLowLiquidity: false,
      route: {
        path: [
          fromAsset.slug,
          toAsset.slug
        ]
      }
    } as SwapQuote);
  }

  async handleSubmitStep (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    const { address, quote, recipient } = params;

    const pair = quote.pair;
    const fromAsset = this.chainService.getAssetBySlug(pair.from);
    const chainInfo = this.chainService.getChainInfoByKey(this.chain);
    const transactionConfig = await getEVMTransactionObject(chainInfo, address, address, quote.fromAmount, false, this.chainService.getEvmApi(chainInfo.slug));
    const txData: SwapBaseTxData = {
      address,
      provider: this.providerInfo,
      quote: params.quote,
      slippage: params.slippage,
      recipient,
      process: params.process
    };

    return {
      txChain: fromAsset.originChain,
      txData,
      extrinsic: transactionConfig,
      transferNativeAmount: _isNativeToken(fromAsset) ? quote.fromAmount : '0', // todo
      extrinsicType: ExtrinsicType.SWAP,
      chainType: ChainType.EVM
    } as SwapSubmitStepData;
  }

  handleSwapProcess (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    const { currentStep, process } = params;
    const type = process.steps[currentStep].type;

    switch (type) {
      case SwapStepType.DEFAULT:
        return Promise.reject(new TransactionError(BasicTxErrorType.UNSUPPORTED));
      case SwapStepType.XCM:
        return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
      case SwapStepType.SET_FEE_TOKEN:
        return Promise.reject(new TransactionError(BasicTxErrorType.UNSUPPORTED));
      case SwapStepType.SWAP:
        return this.handleSubmitStep(params);
      default:
        return this.handleSubmitStep(params);
    }
  }

  validateSwapProcess (params: ValidateSwapProcessParams): Promise<TransactionError[]> {
    return Promise.resolve([]);
  }

  validateSwapRequest (request: SwapRequest): Promise<SwapEarlyValidation> {
    const fromAsset = this.chainService.getAssetBySlug(request.pair.from);
    const toAsset = this.chainService.getAssetBySlug(request.pair.to);

    if (fromAsset.originChain !== this.chain || toAsset.originChain !== this.chain) {
      return Promise.resolve({
        error: SwapErrorType.ASSET_NOT_SUPPORTED
      });
    }

    if (_isSmartContractToken(fromAsset) && _getContractAddressOfToken(fromAsset).length === 0) {
      return Promise.resolve({
        error: SwapErrorType.UNKNOWN
      });
    }

    if (_isSmartContractToken(toAsset) && _getContractAddressOfToken(toAsset).length === 0) {
      return Promise.resolve({
        error: SwapErrorType.UNKNOWN
      });
    }

    try {
      const bnAmount = new BigNumber(request.fromAmount);

      if (bnAmount.lte(0)) {
        return Promise.resolve({
          error: SwapErrorType.AMOUNT_CANNOT_BE_ZERO
        });
      }

      return Promise.resolve({
        metadata: {
          chain: this.chainService.getChainInfoByKey(this.chain)
        } as StellaswapPreValidationMetadata
      });
    } catch (e) {
      return Promise.resolve({
        error: SwapErrorType.UNKNOWN
      });
    }
  }
}
