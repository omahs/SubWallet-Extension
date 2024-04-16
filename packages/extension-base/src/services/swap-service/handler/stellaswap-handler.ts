// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import stellaSwap from '@stellaswap/swap-sdk';
import { COMMON_CHAIN_SLUGS } from '@subwallet/chain-list';
import { _AssetType, _ChainAsset } from '@subwallet/chain-list/types';
import { SwapError } from '@subwallet/extension-base/background/errors/SwapError';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType, ChainType, ExtrinsicType } from '@subwallet/extension-base/background/KoniTypes';
import { getEVMTransactionObject } from '@subwallet/extension-base/koni/api/tokens/evm/transfer';
import { BalanceService } from '@subwallet/extension-base/services/balance-service';
import { ChainService } from '@subwallet/extension-base/services/chain-service';
import { _getChainNativeTokenSlug, _getContractAddressOfToken, _isNativeToken, _isSmartContractToken } from '@subwallet/extension-base/services/chain-service/utils';
import { SwapBaseHandler, SwapBaseInterface } from '@subwallet/extension-base/services/swap-service/handler/base-handler';
import { calculateSwapRate, getEarlyHydradxValidationError, SWAP_QUOTE_TIMEOUT_MAP } from '@subwallet/extension-base/services/swap-service/utils';
import { BaseStepDetail } from '@subwallet/extension-base/types/service-base';
import { HydradxPreValidationMetadata, OptimalSwapPath, OptimalSwapPathParams, StellaswapPreValidationMetadata, SwapBaseTxData, SwapEarlyValidation, SwapErrorType, SwapFeeInfo, SwapFeeType, SwapProviderId, SwapQuote, SwapRequest, SwapRoute, SwapStepType, SwapSubmitParams, SwapSubmitStepData, ValidateSwapProcessParams } from '@subwallet/extension-base/types/swap';
import { AxiosError } from 'axios';
import BigNumber from 'bignumber.js';

interface StellaswapQuoteResp {
  isSuccess: boolean;
  code: number;
  message: string;
  result: StellaswapQuoteResult;
}

interface StellaswapQuoteResult {
  amountOut: string,
  amountOutBn: BigNumber,
  amountOutOriginal: string,
  amountWei: string,
  execution: {
    commands: unknown[],
    inputs: string[]
  },
  fromToken: string,
  midPrice: string,
  outputWithoutSlippage: string,
  toToken: string,
  trades: StellaswapTrade[]
}

interface StellaswapTrade {
  amountIn: string,
  amountOut: string,
  amountOutBn: BigNumber,
  amountOutOriginal: string,
  fromToken: string,
  path: string[],
  protocol: string,
  toToken: string,
  type: string
}

export class StellaswapHandler implements SwapBaseInterface {
  private swapBaseHandler: SwapBaseHandler;
  isTestnet: boolean;

  constructor (chainService: ChainService, balanceService: BalanceService, isTestnet = true) { // todo: pass in baseHandler from service
    this.swapBaseHandler = new SwapBaseHandler({
      balanceService,
      chainService,
      providerName: isTestnet ? 'Stellaswap Testnet' : 'Stellaswap',
      providerSlug: isTestnet ? SwapProviderId.STELLASWAP_TESTNET : SwapProviderId.STELLASWAP
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

  private parseSwapPath (assetIn: string, assetOut: string, swapList: string[]): SwapRoute {
    try {
      const swapAssets = this.chainService.getAssetByChainAndType(this.chain, [_AssetType.LOCAL, _AssetType.ERC20]);
      const nativeToken = this.chainService.getNativeTokenInfo(this.chain);

      const swapAssetContractMap: Record<string, _ChainAsset> = Object.values(swapAssets).reduce((accumulator, asset) => {
        return {
          ...accumulator,
          [_getContractAddressOfToken(asset).toLowerCase()]: asset // Local tokens might not have contract address
        };
      }, { ETH: nativeToken });

      const path: string[] = [assetIn];

      swapList.forEach((contractAddress) => {
        const swapAssetIn = swapAssetContractMap[contractAddress.toLowerCase()]?.slug;
        const swapAssetOut = swapAssetContractMap[contractAddress.toLowerCase()]?.slug;

        if (swapAssetIn && !path.includes(swapAssetIn)) {
          path.push(swapAssetIn);
        }

        if (swapAssetOut && !path.includes(swapAssetOut)) {
          path.push(swapAssetOut);
        }
      });

      if (path[path.length - 1] !== assetOut) {
        path.push(assetOut);
      }

      return {
        path
      };
    } catch (e) {
      return {
        path: [assetIn, assetOut]
      };
    }
  }

  async getSwapQuote (request: SwapRequest): Promise<SwapQuote | SwapError> {
    const fromAsset = this.chainService.getAssetBySlug(request.pair.from);
    const toAsset = this.chainService.getAssetBySlug(request.pair.to);
    const fromAssetAddress = _isNativeToken(fromAsset) ? 'ETH' : _getContractAddressOfToken(fromAsset);
    const toAssetAddress = _isNativeToken(toAsset) ? 'ETH' : _getContractAddressOfToken(toAsset);

    const fromChain = this.chainService.getChainInfoByKey(fromAsset.originChain);
    const fromChainNativeTokenSlug = _getChainNativeTokenSlug(fromChain);

    const earlyValidation = await this.validateSwapRequest(request);

    if (earlyValidation.error) {
      const metadata = earlyValidation.metadata as HydradxPreValidationMetadata;

      return getEarlyHydradxValidationError(earlyValidation.error, metadata);
    }

    try {
      const slippage = request.slippage * 100;
      const quote = await stellaSwap.getQuote(fromAssetAddress, toAssetAddress, request.fromAmount, request.address, slippage.toString()) as StellaswapQuoteResp;

      const toAmount = quote.result.amountOutOriginal;
      const swapPath = this.parseSwapPath(fromAsset.slug, toAsset.slug, quote.result.trades[0].path);

      return Promise.resolve({
        pair: request.pair,
        fromAmount: request.fromAmount,
        toAmount,
        rate: calculateSwapRate(request.fromAmount, toAmount, fromAsset, toAsset),
        provider: this.providerInfo,
        aliveUntil: +Date.now() + (SWAP_QUOTE_TIMEOUT_MAP[this.slug] || SWAP_QUOTE_TIMEOUT_MAP.default),
        feeInfo: {
          feeComponent: [ // todo
            {
              tokenSlug: fromChainNativeTokenSlug,
              amount: '100000000000000',
              feeType: SwapFeeType.NETWORK_FEE
            }
          ],
          defaultFeeToken: fromChainNativeTokenSlug,
          feeOptions: [fromChainNativeTokenSlug] // todo: parse fee options
        },
        isLowLiquidity: false,
        route: swapPath
      } as SwapQuote);
    } catch (e) {
      const error = e as AxiosError;

      console.log(error);

      return new SwapError(SwapErrorType.ERROR_FETCHING_QUOTE);
    }
  }

  async handleSubmitStep (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    const { address, quote, recipient } = params;
    const pair = quote.pair;
    const fromAsset = this.chainService.getAssetBySlug(pair.from);
    const chainInfo = this.chainService.getChainInfoByKey(this.chain);
    const transactionConfig = await getEVMTransactionObject(chainInfo, address, '0xeb70c2E0c0DCD6A6187D75b55AFc25b3B3ebE5a2', quote.fromAmount, false, this.chainService.getEvmApi(chainInfo.slug));

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
      extrinsic: transactionConfig[0],
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
