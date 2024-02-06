// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ConfirmationDefinitions, ExtrinsicType } from '@subwallet/extension-base/background/KoniTypes';
import { SigningRequest } from '@subwallet/extension-base/background/types';
import { SWTransactionResult } from '@subwallet/extension-base/services/transaction-service/types';
import { RootState } from '@subwallet/extension-web-ui/stores';
import { ConfirmationQueueItem } from '@subwallet/extension-web-ui/stores/base/RequestState';
import { AlertDialogProps, ThemeProps } from '@subwallet/extension-web-ui/types';
import CN from 'classnames';
import React, { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import styled from 'styled-components';

import { EvmSignArea, SubstrateSignArea } from '../../parts/Sign';
import { BaseTransactionConfirmation, BondTransactionConfirmation, CancelUnstakeTransactionConfirmation, ClaimRewardTransactionConfirmation, DefaultWithdrawTransactionConfirmation, FastWithdrawTransactionConfirmation, JoinPoolTransactionConfirmation, JoinYieldPoolConfirmation, LeavePoolTransactionConfirmation, SendNftTransactionConfirmation, TokenApproveConfirmation, TransferBlock, UnbondTransactionConfirmation, WithdrawTransactionConfirmation } from './variants';

interface Props extends ThemeProps {
  confirmation: ConfirmationQueueItem;
  openAlert: (alertProps: AlertDialogProps) => void;
  closeAlert: VoidFunction;
}

const getTransactionComponent = (extrinsicType: ExtrinsicType): typeof BaseTransactionConfirmation => {
  switch (extrinsicType) {
    case ExtrinsicType.TRANSFER_BALANCE:
    case ExtrinsicType.TRANSFER_TOKEN:
    case ExtrinsicType.TRANSFER_XCM:
      return TransferBlock;
    case ExtrinsicType.SEND_NFT:
      return SendNftTransactionConfirmation;
    case ExtrinsicType.STAKING_JOIN_POOL:
      return JoinPoolTransactionConfirmation;
    case ExtrinsicType.STAKING_LEAVE_POOL:
      return LeavePoolTransactionConfirmation;
    case ExtrinsicType.STAKING_BOND:
      return BondTransactionConfirmation;
    case ExtrinsicType.STAKING_UNBOND:
      return UnbondTransactionConfirmation;
    case ExtrinsicType.STAKING_WITHDRAW:
      return WithdrawTransactionConfirmation;
    case ExtrinsicType.STAKING_CLAIM_REWARD:
      return ClaimRewardTransactionConfirmation;
    case ExtrinsicType.STAKING_CANCEL_UNSTAKE:
      return CancelUnstakeTransactionConfirmation;
    case ExtrinsicType.MINT_QDOT:
    case ExtrinsicType.MINT_VDOT:
    case ExtrinsicType.MINT_LDOT:
    case ExtrinsicType.MINT_SDOT:
    case ExtrinsicType.MINT_STDOT:
      return JoinYieldPoolConfirmation;
    case ExtrinsicType.REDEEM_QDOT:
    case ExtrinsicType.REDEEM_VDOT:
    case ExtrinsicType.REDEEM_LDOT:
    case ExtrinsicType.REDEEM_SDOT:
    case ExtrinsicType.REDEEM_STDOT:
      return FastWithdrawTransactionConfirmation;
    case ExtrinsicType.UNSTAKE_QDOT:
    case ExtrinsicType.UNSTAKE_VDOT:
    case ExtrinsicType.UNSTAKE_LDOT:
    case ExtrinsicType.UNSTAKE_SDOT:
    case ExtrinsicType.UNSTAKE_STDOT:
      return DefaultWithdrawTransactionConfirmation;
    case ExtrinsicType.TOKEN_APPROVE:
      return TokenApproveConfirmation;
    default:
      return BaseTransactionConfirmation;
  }
};

const Component: React.FC<Props> = (props: Props) => {
  const { className, closeAlert, confirmation: { item, type },
    openAlert } = props;
  const { id } = item;

  const { transactionRequest } = useSelector((state: RootState) => state.requestState);

  const transaction = useMemo(() => transactionRequest[id], [transactionRequest, id]);

  const renderContent = useCallback((transaction: SWTransactionResult): React.ReactNode => {
    const { extrinsicType } = transaction;

    const Component = getTransactionComponent(extrinsicType);

    return (
      <Component
        closeAlert={closeAlert}
        openAlert={openAlert}
        transaction={transaction}
      />
    );
  }, [closeAlert, openAlert]);

  return (
    <>
      <div className={CN(className, 'confirmation-content')}>
        {renderContent(transaction)}
      </div>
      {
        type === 'signingRequest' && (
          <SubstrateSignArea
            account={(item as SigningRequest).account}
            extrinsicType={transaction.extrinsicType}
            id={item.id}
            request={(item as SigningRequest).request}
          />
        )
      }
      {
        (type === 'evmSendTransactionRequest' || type === 'evmWatchTransactionRequest') && (
          <EvmSignArea
            extrinsicType={transaction.extrinsicType}
            id={item.id}
            payload={(item as ConfirmationDefinitions['evmSendTransactionRequest' | 'evmWatchTransactionRequest'][0])}
            type={type}
          />
        )
      }
    </>
  );
};

const TransactionConfirmation = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return {
    '--content-gap': 0,
    marginTop: token.marginXS,

    '.-to-right': {
      '.__value': {
        textAlign: 'right'
      }
    }
  };
});

export default TransactionConfirmation;