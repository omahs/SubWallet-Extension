// Copyright 2019-2022 @subwallet/extension-base
// SPDX-License-Identifier: Apache-2.0

import { SwapError } from '@subwallet/extension-base/background/errors/SwapError';
import { TransactionError } from '@subwallet/extension-base/background/errors/TransactionError';
import { BasicTxErrorType } from '@subwallet/extension-base/background/KoniTypes';
import KoniState from '@subwallet/extension-base/koni/background/handlers/State';
import { ServiceStatus, ServiceWithProcessInterface, StoppableServiceInterface } from '@subwallet/extension-base/services/base/types';
import { ChainService } from '@subwallet/extension-base/services/chain-service';
import { EventService } from '@subwallet/extension-base/services/event-service';
import { SwapBaseInterface } from '@subwallet/extension-base/services/swap-service/handler/base-handler';
import { ChainflipSwapHandler } from '@subwallet/extension-base/services/swap-service/handler/chainflip-handler';
import { DEFAULT_SWAP_FIRST_STEP, getSwapAltToken, MOCK_SWAP_FEE, SWAP_QUOTE_TIMEOUT_MAP } from '@subwallet/extension-base/services/swap-service/utils';
import { _SUPPORTED_SWAP_PROVIDERS, OptimalSwapPath, OptimalSwapPathParams, QuoteAskResponse, SwapErrorType, SwapPair, SwapProviderId, SwapQuote, SwapQuoteResponse, SwapRequest, SwapRequestResult, SwapStepType, SwapSubmitParams, SwapSubmitStepData, ValidateSwapProcessParams } from '@subwallet/extension-base/types/swap';
import { createPromiseHandler, PromiseHandler } from '@subwallet/extension-base/utils';
import { BehaviorSubject } from 'rxjs';

export class SwapService implements ServiceWithProcessInterface, StoppableServiceInterface {
  protected readonly state: KoniState;
  private eventService: EventService;
  private readonly chainService: ChainService;
  private swapPairSubject: BehaviorSubject<SwapPair[]> = new BehaviorSubject<SwapPair[]>([]);
  private handlers: Record<string, SwapBaseInterface> = {};

  startPromiseHandler: PromiseHandler<void> = createPromiseHandler();
  stopPromiseHandler: PromiseHandler<void> = createPromiseHandler();
  status: ServiceStatus = ServiceStatus.NOT_INITIALIZED;

  constructor (state: KoniState) {
    this.state = state;
    this.eventService = state.eventService;
    this.chainService = state.chainService;
  }

  private async askProvidersForQuote (request: SwapRequest): Promise<QuoteAskResponse[]> {
    const availableQuotes: QuoteAskResponse[] = [];

    await Promise.all(Object.values(this.handlers).map(async (handler) => {
      if (handler.init && handler.isReady === false) {
        await handler.init();
      }

      const quote = await handler.getSwapQuote(request);

      if (!(quote instanceof SwapError)) {
        availableQuotes.push({
          quote
        });
      } else {
        availableQuotes.push({
          error: quote
        });
      }
    }));

    return availableQuotes; // todo: need to propagate error for further handling
  }

  private getDefaultProcess (params: OptimalSwapPathParams): OptimalSwapPath {
    const result: OptimalSwapPath = {
      totalFee: [MOCK_SWAP_FEE],
      steps: [DEFAULT_SWAP_FIRST_STEP]
    };

    result.totalFee.push({
      feeComponent: [],
      feeOptions: [params.request.pair.from],
      defaultFeeToken: params.request.pair.from
    });
    result.steps.push({
      id: result.steps.length,
      name: 'Swap',
      type: SwapStepType.SWAP
    });

    return result;
  }

  public async generateOptimalProcess (params: OptimalSwapPathParams): Promise<OptimalSwapPath> {
    if (!params.selectedQuote) {
      return this.getDefaultProcess(params);
    } else {
      const providerId = params.selectedQuote.provider.id;
      const handler = this.handlers[providerId];

      if (handler) {
        return handler.generateOptimalProcess(params);
      } else {
        return this.getDefaultProcess(params);
      }
    }
  }

  public async handleSwapRequest (request: SwapRequest): Promise<SwapRequestResult> {
    /*
    * 1. Ask swap quotes from providers
    * 2. Select the best quote
    * 3. Generate optimal process for that quote
    * */

    const swapQuoteResponse = await this.getLatestQuotes(request);

    const optimalProcess = await this.generateOptimalProcess({
      request,
      selectedQuote: swapQuoteResponse.optimalQuote
    });

    console.log('optimalProcess', optimalProcess);

    return {
      process: optimalProcess,
      quote: swapQuoteResponse
    } as SwapRequestResult;
  }

  public async getLatestQuotes (request: SwapRequest): Promise<SwapQuoteResponse> {
    request.pair.metadata = this.getSwapPairMetadata(request.pair.slug); // todo: improve this
    const quoteAskResponses = await this.askProvidersForQuote(request);

    // todo: handle error to return back to UI
    // todo: more logic to select the best quote

    const availableQuotes = quoteAskResponses.filter((quote) => !quote.error).map((quote) => quote.quote as SwapQuote);
    let quoteError: SwapError | undefined;
    let selectedQuote: SwapQuote | undefined;
    let aliveUntil = (+Date.now() + SWAP_QUOTE_TIMEOUT_MAP.default);

    if (availableQuotes.length === 0) {
      const preferredErrorResp = quoteAskResponses.find((quote) => {
        return !!quote.error && ![SwapErrorType.UNKNOWN, SwapErrorType.ASSET_NOT_SUPPORTED].includes(quote.error.errorType);
      });

      const defaultErrorResp = quoteAskResponses.find((quote) => !!quote.error);

      quoteError = preferredErrorResp?.error || defaultErrorResp?.error;
    } else {
      selectedQuote = availableQuotes[0];
      aliveUntil = selectedQuote?.aliveUntil || (+Date.now() + SWAP_QUOTE_TIMEOUT_MAP.default);
    }

    return {
      optimalQuote: selectedQuote,
      quotes: availableQuotes,
      error: quoteError,
      aliveUntil
    } as SwapQuoteResponse;
  }

  private initHandlers () {
    _SUPPORTED_SWAP_PROVIDERS.forEach((providerId) => {
      switch (providerId) {
        case SwapProviderId.CHAIN_FLIP_TESTNET:
          this.handlers[providerId] = new ChainflipSwapHandler(this.chainService, this.state.balanceService);

          break;
        case SwapProviderId.CHAIN_FLIP_MAINNET:
          this.handlers[providerId] = new ChainflipSwapHandler(this.chainService, this.state.balanceService, false);

          break;

          // case SwapProviderId.HYDRADX_TESTNET:
          //   this.handlers[providerId] = new HydradxHandler(this.chainService, this.state.balanceService);
          //   break;
          //
          // case SwapProviderId.HYDRADX_MAINNET:
          //   this.handlers[providerId] = new HydradxHandler(this.chainService, this.state.balanceService, false);
          //   break;

        default:
          throw new Error('Unsupported provider');
      }
    });
  }

  async init (): Promise<void> {
    this.status = ServiceStatus.INITIALIZING;
    this.eventService.emit('swap.ready', true);

    this.status = ServiceStatus.INITIALIZED;

    this.initHandlers();

    await this.start();
  }

  async start (): Promise<void> {
    if (this.status === ServiceStatus.STOPPING) {
      await this.waitForStopped();
    }

    if (this.status === ServiceStatus.STARTED || this.status === ServiceStatus.STARTING) {
      return this.waitForStarted();
    }

    this.status = ServiceStatus.STARTING;

    // todo: start the service jobs, subscribe data,...

    this.swapPairSubject.next(this.getSwapPairs()); // todo: might need to change it online

    // Update promise handler
    this.startPromiseHandler.resolve();
    this.stopPromiseHandler = createPromiseHandler();

    this.status = ServiceStatus.STARTED;
  }

  async stop (): Promise<void> {
    if (this.status === ServiceStatus.STARTING) {
      await this.waitForStarted();
    }

    if (this.status === ServiceStatus.STOPPED || this.status === ServiceStatus.STOPPING) {
      return this.waitForStopped();
    }

    // todo: unsub, persist data,...

    this.stopPromiseHandler.resolve();
    this.startPromiseHandler = createPromiseHandler();

    this.status = ServiceStatus.STOPPED;
  }

  waitForStarted (): Promise<void> {
    return this.startPromiseHandler.promise;
  }

  waitForStopped (): Promise<void> {
    return this.stopPromiseHandler.promise;
  }

  public getSwapPairs (): SwapPair[] {
    return Object.entries(this.chainService.swapRefMap).map(([slug, assetRef]) => {
      const fromAsset = this.chainService.getAssetBySlug(assetRef.srcAsset);

      return {
        slug,
        from: assetRef.srcAsset,
        to: assetRef.destAsset,
        metadata: {
          alternativeAsset: getSwapAltToken(fromAsset)
        }
      } as SwapPair;
    });
  }

  private getSwapPairMetadata (slug: string): Record<string, any> | undefined {
    return this.getSwapPairs().find((pair) => pair.slug === slug)?.metadata;
  }

  public async validateSwapProcess (params: ValidateSwapProcessParams): Promise<TransactionError[]> {
    const providerId = params.selectedQuote.provider.id;
    const handler = this.handlers[providerId];

    if (handler) {
      return handler.validateSwapProcess(params);
    } else {
      return [new TransactionError(BasicTxErrorType.INTERNAL_ERROR)];
    }
  }

  public async handleSwapProcess (params: SwapSubmitParams): Promise<SwapSubmitStepData> {
    const handler = this.handlers[params.quote.provider.id];

    if (params.process.steps.length === 1) { // todo: do better to handle error generating steps
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR, 'Please check your network and try again'));
    }

    if (handler) {
      return handler.handleSwapProcess(params);
    } else {
      return Promise.reject(new TransactionError(BasicTxErrorType.INTERNAL_ERROR));
    }
  }

  public subscribeSwapPairs (callback: (pairs: SwapPair[]) => void) {
    return this.chainService.subscribeSwapRefMap().subscribe((refMap) => {
      const latestData = Object.entries(refMap).map(([slug, assetRef]) => {
        const fromAsset = this.chainService.getAssetBySlug(assetRef.srcAsset);

        return {
          slug,
          from: assetRef.srcAsset,
          to: assetRef.destAsset,
          metadata: {
            alternativeAsset: getSwapAltToken(fromAsset)
          }
        } as SwapPair;
      });

      callback(latestData);
    });
  }
}
