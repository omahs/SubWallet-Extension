// Copyright 2019-2022 @subwallet/extension-web-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { ExtrinsicType } from '@subwallet/extension-base/background/KoniTypes';
import { getYieldAvailableActionsByPosition, getYieldAvailableActionsByType, YieldAction } from '@subwallet/extension-base/koni/api/staking/bonding/utils';
import { SpecialYieldPoolInfo, SpecialYieldPositionInfo, YieldPoolInfo, YieldPoolType } from '@subwallet/extension-base/types';
import { MetaInfo } from '@subwallet/extension-web-ui/components';
import EarningTypeTag from '@subwallet/extension-web-ui/components/Earning/EarningTypeTag';
import { EarningStatusUi } from '@subwallet/extension-web-ui/constants';
import { usePreCheckAction, useSelector, useTranslation } from '@subwallet/extension-web-ui/hooks';
import { ExtraYieldPositionInfo, PhosphorIcon, Theme, ThemeProps } from '@subwallet/extension-web-ui/types';
import { getEarnExtrinsicType, getUnstakeExtrinsicType, getWithdrawExtrinsicType } from '@subwallet/extension-web-ui/utils';
import { Button, ButtonProps, Icon, Logo, Number } from '@subwallet/react-ui';
import BigN from 'bignumber.js';
import CN from 'classnames';
import { MinusCircle, PlusCircle, Question, StopCircle, Wallet } from 'phosphor-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled, { useTheme } from 'styled-components';

interface Props extends ThemeProps {
  onClickCancelUnStakeButton: () => void;
  onClickClaimButton: () => void;
  onClickItem?: () => void;
  onClickStakeButton: () => void;
  onClickUnStakeButton: () => void;
  onClickWithdrawButton: () => void;
  onClickInstructionButton: () => void;
  poolInfo: YieldPoolInfo;
  positionInfo: ExtraYieldPositionInfo;
  isShowBalance?: boolean;
  unclaimedReward?: string
}

interface ButtonOptionProps {
  icon: PhosphorIcon;
  label?: string;
  tooltip?: string;
  key: string;
  onClick?: React.MouseEventHandler;
  disable: boolean;
  hidden: boolean;
  schema?: ButtonProps['schema'];
}

const Component: React.FC<Props> = (props: Props) => {
  const { className, isShowBalance, onClickCancelUnStakeButton,
    onClickClaimButton, onClickInstructionButton, onClickItem, onClickStakeButton,
    onClickUnStakeButton, onClickWithdrawButton, poolInfo, positionInfo, unclaimedReward } = props;

  const assetRegistry = useSelector((state) => state.assetRegistry.assetRegistry);

  const { t } = useTranslation();
  const { token } = useTheme() as Theme;

  const line3Ref = useRef<HTMLDivElement | null>(null);
  const line3LeftPartRef = useRef<HTMLDivElement | null>(null);
  const line3RightPartRef = useRef<HTMLDivElement | null>(null);

  const { address } = positionInfo;

  const preCheckAction = usePreCheckAction(address, false);

  const [isCompactButtons, setCompactButtons] = useState<boolean>(false);

  const isSpecial = useMemo(() => [YieldPoolType.LENDING, YieldPoolType.LIQUID_STAKING].includes(positionInfo.type), [positionInfo.type]);

  const deriveAsset = useMemo(() => {
    if ('derivativeToken' in positionInfo) {
      const position = positionInfo as SpecialYieldPositionInfo;

      return assetRegistry[position.derivativeToken];
    } else {
      return undefined;
    }
  }, [assetRegistry, positionInfo]);

  const exchangeRate = useMemo(() => {
    let rate = 1;

    if ('derivativeToken' in positionInfo) {
      const _item = positionInfo as SpecialYieldPositionInfo;
      const _poolInfo = poolInfo as SpecialYieldPoolInfo;
      const balanceToken = _item.balanceToken;

      if (_poolInfo) {
        const asset = _poolInfo.statistic?.assetEarning.find((i) => i.slug === balanceToken);

        rate = asset?.exchangeRate || 1;
      }
    }

    return rate;
  }, [positionInfo, poolInfo]);

  const activeStake = useMemo(() => {
    return new BigN(positionInfo.activeStake).multipliedBy(exchangeRate);
  }, [positionInfo.activeStake, exchangeRate]);

  const availableActionsByMetadata = useMemo(() => {
    return getYieldAvailableActionsByPosition(positionInfo, poolInfo, unclaimedReward);
  }, [poolInfo, positionInfo, unclaimedReward]);

  const actionListByChain = useMemo(() => {
    return getYieldAvailableActionsByType(poolInfo);
  }, [poolInfo]);

  useEffect(() => {
    const updateCompactButtons = () => {
      if (line3Ref.current && line3LeftPartRef.current && line3RightPartRef.current) {
        const line3 = line3Ref.current.clientWidth;
        const line3LeftPart = line3LeftPartRef.current.clientWidth;
        const line3RightPart = line3RightPartRef.current.clientWidth;

        if (line3LeftPart + 16 + line3RightPart > line3) {
          setCompactButtons(true);
        } else {
          setCompactButtons(false);
        }
      }
    };

    updateCompactButtons();

    window.addEventListener('resize', updateCompactButtons);

    // Cleanup the event listener when the component unmounts
    return () => {
      window.removeEventListener('resize', updateCompactButtons);
    };
  }, []);

  const onClickButton = useCallback((callback: VoidFunction, extrinsicType?: ExtrinsicType): React.MouseEventHandler => {
    return (event) => {
      event.stopPropagation();

      if (extrinsicType) {
        preCheckAction(callback, extrinsicType)();
      } else {
        callback();
      }
    };
  }, [preCheckAction]);

  const getButtons = useCallback((compact?: boolean): ButtonOptionProps[] => {
    const result: ButtonOptionProps[] = [];

    actionListByChain.forEach((item) => {
      const temp: ButtonOptionProps = {
        disable: !availableActionsByMetadata.includes(item),
        key: item,
        hidden: false
      } as ButtonOptionProps;

      let text: string;

      switch (item) {
        case YieldAction.STAKE:
        case YieldAction.START_EARNING:
          text = poolInfo.type === YieldPoolType.LENDING ? t('Supply more') : t('Stake now');

          temp.icon = PlusCircle;
          temp.label = !compact ? text : undefined;
          temp.tooltip = compact ? text : undefined;
          temp.onClick = onClickButton(onClickStakeButton, getEarnExtrinsicType(poolInfo));
          break;

        case YieldAction.CLAIM_REWARD:
          temp.icon = Wallet;
          temp.onClick = onClickButton(onClickClaimButton, ExtrinsicType.STAKING_CLAIM_REWARD);
          temp.label = !compact ? t('Claim rewards') : undefined;
          temp.tooltip = compact ? t('Claim rewards') : undefined;
          break;
        case YieldAction.WITHDRAW:
        case YieldAction.WITHDRAW_EARNING:
          temp.icon = StopCircle;
          temp.onClick = onClickButton(onClickWithdrawButton, getWithdrawExtrinsicType(poolInfo));
          temp.label = !compact ? t('Withdraw') : undefined;
          temp.tooltip = compact ? t('Withdraw') : undefined;
          temp.schema = 'secondary';
          break;
        case YieldAction.UNSTAKE:
          temp.icon = MinusCircle;
          temp.onClick = onClickButton(onClickUnStakeButton, getUnstakeExtrinsicType(poolInfo));
          temp.label = !compact ? t('Unstake') : undefined;
          temp.tooltip = compact ? t('Unstake') : undefined;
          temp.schema = 'secondary';
          break;
        case YieldAction.CANCEL_UNSTAKE:
          temp.icon = MinusCircle;
          temp.onClick = onClickButton(onClickCancelUnStakeButton, ExtrinsicType.STAKING_CANCEL_UNSTAKE);
          temp.label = !compact ? t('Cancel unstake') : undefined;
          temp.tooltip = compact ? t('Cancel unstake') : undefined;
          temp.schema = 'secondary';
          break;
      }

      result.push(temp);
    });

    return result;
  }, [actionListByChain, availableActionsByMetadata, onClickButton, onClickCancelUnStakeButton, onClickClaimButton, onClickStakeButton, onClickUnStakeButton, onClickWithdrawButton, poolInfo, t]);

  return (
    <div
      className={CN(className)}
      onClick={onClickItem}
    >
      <Logo
        className='__item-logo'
        network={poolInfo.metadata.logo || poolInfo.chain}
        size={64}
      />

      <div className='__item-lines-container'>
        <div className='__item-line-1 __item-line-common'>
          <div className={'__item-name-wrapper'}>
            <div className={'__item-token-info'}>
              <span>{positionInfo.asset.symbol}</span>
              <span className={'__item-token-name'}>
              &nbsp;(
                <span className={'__name'}>{poolInfo.metadata.shortName}</span>
              )
              </span>
              <Button
                icon={(
                  <Icon
                    customSize={'28px'}
                    phosphorIcon={Question}
                  />
                )}
                onClick={onClickButton(onClickInstructionButton)}
                size='xs'
                type='ghost'
              >
              </Button>
            </div>
          </div>

          <MetaInfo>
            <MetaInfo.Status
              className={'__item-status'}
              statusIcon={EarningStatusUi[positionInfo.status].icon}
              statusName={EarningStatusUi[positionInfo.status].name}
              valueColorSchema={EarningStatusUi[positionInfo.status].schema}
            />
          </MetaInfo>
        </div>

        <div className='__item-line-2 __item-line-common'>
          <EarningTypeTag
            chain={poolInfo.chain}
            className={'__item-tag'}
            type={poolInfo.type}
          />

          <div className='__item-total-balance-value'>
            <Number
              decimal={positionInfo.asset.decimals || 0}
              hide={!isShowBalance}
              suffix={positionInfo.asset.symbol}
              value={activeStake}
            />
          </div>
        </div>

        <div
          className='__item-line-3 __item-line-common'
          ref={line3Ref}
        >
          <div className={CN('__item-buttons-wrapper', { '-compact': isCompactButtons })}>
            <div
              className='__item-buttons'
            >
              {getButtons(true).map((item) => {
                return (
                  <Button
                    className='__item-button-action'
                    disabled={item.disable}
                    icon={(
                      <Icon
                        className={'__item-stake-button'}
                        phosphorIcon={item.icon}
                        size='sm'
                        weight='fill'
                      />
                    )}
                    key={item.key}
                    onClick={item.onClick}
                    schema={item.schema}
                    shape='circle'
                    size='xs'
                    tooltip={item.tooltip}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>

            <div
              className='__item-shadow-buttons'
              ref={line3LeftPartRef}
            >
              {getButtons().map((item) => {
                return (
                  <Button
                    className='__item-button-action'
                    disabled={item.disable}
                    icon={(
                      <Icon
                        className={'__item-stake-button'}
                        phosphorIcon={item.icon}
                        size='sm'
                        weight='fill'
                      />
                    )}
                    key={item.key}
                    onClick={item.onClick}
                    schema={item.schema}
                    shape='circle'
                    size='xs'
                    tooltip={item.tooltip}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div
            className={'__item-label-and-value'}
            ref={line3RightPartRef}
          >
            {isSpecial && (
              <div className={'__item-equivalent'}>
                <div className={'__item-equivalent-label'}>
                  {t('Equivalent to')}:
                </div>

                <div className={'__item-equivalent-value'}>
                  <Number
                    decimal={deriveAsset?.decimals || 0}
                    decimalColor={token.colorSuccess}
                    intColor={token.colorSuccess}
                    suffix={deriveAsset?.symbol}
                    unitColor={token.colorSuccess}
                    value={positionInfo.activeStake}
                  />
                </div>
              </div>
            )}

            {positionInfo.type === YieldPoolType.NOMINATION_POOL &&
              <div className={'__item-unclaimed-rewards'}>
                <div className={'__item-unclaimed-rewards-label'}>
                  {t('Unclaimed rewards')}:
                </div>
                <div className={'__item-unclaimed-rewards-value'}>
                  <Number
                    decimal={positionInfo.asset.decimals || 0}
                    decimalColor={token.colorSuccess}
                    intColor={token.colorSuccess}
                    suffix={positionInfo.asset.symbol}
                    unitColor={token.colorSuccess}
                    value={unclaimedReward || '0'}
                  />
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  );
};

const EarningPositionDesktopItem = styled(Component)<Props>(({ theme: { token } }: Props) => {
  return ({
    backgroundColor: token.colorBgSecondary,
    borderRadius: token.borderRadiusLG,
    cursor: 'pointer',
    padding: `${token.paddingXL}px ${token.paddingMD}px ${token.padding}px`,
    display: 'flex',
    '&:hover': {
      backgroundColor: token.colorBgInput
    },

    '.__item-logo': {
      marginRight: token.size
    },
    '.__item-token-name': {
      color: token.colorTextTertiary,
      display: 'flex',
      flexDirection: 'row',
      overflow: 'hidden',

      '._name': {
        textOverflow: 'ellipsis',
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }
    },

    '.__item-lines-container': {
      overflow: 'hidden',
      flex: 1
    },

    '.__item-line-common': {
      display: 'flex',
      justifyContent: 'space-between',
      overflow: 'hidden',
      gap: token.size
    },

    '.__item-line-1': {
      marginBottom: 2
    },

    '.__item-name-wrapper': {
      display: 'flex',
      alignItems: 'center',
      gap: token.paddingSM,
      overflow: 'hidden'
    },

    '.__item-status, .__item-total-balance-value': {
      'white-space': 'nowrap'
    },

    '.__item-token-info': {
      display: 'flex',
      fontSize: token.fontSizeHeading4,
      lineHeight: token.lineHeightHeading4,
      fontWeight: 600,
      color: token.colorTextLight1,
      'white-space': 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    '.__item-tag': {
      marginRight: 0,
      'white-space': 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    '.__item-description': {
      fontSize: token.fontSizeSM,
      lineHeight: token.lineHeightSM,
      fontWeight: 500,
      color: token.colorTextLight4,
      display: '-webkit-box',
      '-webkit-line-clamp': '2',
      '-webkit-box-orient': 'vertical',
      overflow: 'hidden'
    },

    '.__item-total-balance-value': {
      fontSize: 30,
      lineHeight: `${38}px`,
      color: token.colorTextLight1,
      fontWeight: token.headingFontWeight,

      '.ant-number, .ant-number-integer': {
        color: 'inherit !important',
        fontSize: 'inherit !important',
        fontWeight: 'inherit !important',
        lineHeight: 'inherit'
      },

      '.ant-number-decimal, .ant-number-suffix': {
        color: `${token.colorTextTertiary} !important`,
        fontSize: '24px !important',
        fontWeight: 'inherit !important',
        lineHeight: `${24}px`
      }
    },

    '.__item-line-2': {
      marginBottom: token.marginXXS
    },

    '.__item-label-and-value': {
      overflow: 'hidden'
    },

    '.earning-item-icon-btn': {
      border: `2px solid ${token.colorBgBorder}`,
      borderRadius: '50%'
    },

    '.__item-stake-button': {
      width: token.sizeMD,
      height: token.sizeMD
    },

    '.__item-status': {
      display: 'block'
    },

    '.__item-button-action': {
      '&.ant-btn-default.-schema-secondary': {
        borderWidth: '2px',
        borderStyle: 'solid',
        borderColor: token.colorBgBorder,

        '&:hover:not(:disabled)': {
          borderColor: token['gray-2']
        }
      }
    },

    '.__item-equivalent, .__item-unclaimed-rewards': {
      display: 'flex',
      'white-space': 'nowrap',
      overflow: 'hidden',
      gap: token.sizeXXS,
      fontWeight: token.headingFontWeight,
      fontSize: token.fontSize,
      lineHeight: token.lineHeight
    },

    '.__item-equivalent-label, .__item-unclaimed-rewards-label': {
      color: token.colorTextLight4,
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    },

    '.__item-equivalent-value, .__item-unclaimed-rewards-value': {
      '.ant-number .ant-typography': {
        fontSize: 'inherit !important',
        fontWeight: 'inherit !important',
        lineHeight: 'inherit',
        textAlign: 'end'
      }
    },

    '.__item-buttons, .__item-shadow-buttons': {
      display: 'flex',
      paddingTop: token.paddingXS,
      paddingBottom: token.paddingXS
    },

    '.__item-buttons': {
      gap: token.paddingSM
    },

    '.__item-shadow-buttons': {
      gap: token.paddingSM,
      position: 'absolute',
      left: 0,
      top: 0
    },

    '.__item-buttons-wrapper': {
      position: 'relative',

      '.__item-buttons': {
        opacity: 0,
        pointerEvents: 'none'
      },

      '.__item-shadow-buttons': {
        opacity: 1,
        pointerEvents: 'auto'
      },

      '&.-compact': {
        '.__item-buttons': {
          opacity: 1,
          pointerEvents: 'auto'
        },

        '.__item-shadow-buttons': {
          opacity: 0,
          pointerEvents: 'none'
        }
      }
    },
    '.__item-line-1, .__item-line-2': {
      display: 'flex',
      justifyContent: 'space-between',
      gap: token.sizeSM
    },

    '.__item-button': {
      '&:disabled': {
        opacity: 0.4
      }
    },

    '.__item-tags-container': {
      flex: 1,
      display: 'flex',
      overflow: 'hidden',
      gap: token.sizeXS
    },

    '.__item-upper-part': {
      display: 'flex',
      paddingBottom: token.sizeXS
    },

    '.__item-lower-part': {
      borderTop: '2px solid rgba(33, 33, 33, 0.80)',
      display: 'flex',
      alignItems: 'center'
    }
  });
});

export default EarningPositionDesktopItem;
