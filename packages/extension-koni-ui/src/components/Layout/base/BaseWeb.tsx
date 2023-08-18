// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import Headers from '@subwallet/extension-koni-ui/components/Layout/parts/Header';
import { ScreenContext } from '@subwallet/extension-koni-ui/contexts/ScreenContext';
import { HeaderType, WebUIContext } from '@subwallet/extension-koni-ui/contexts/WebUIContext';
import { useDefaultNavigate, useTranslation } from '@subwallet/extension-koni-ui/hooks';
import { ThemeProps } from '@subwallet/extension-koni-ui/types';
import CN from 'classnames';
import React, { useContext, useMemo } from 'react';
import styled from 'styled-components';

import SideMenu from '../parts/SideMenu';

export interface LayoutBaseWebProps {
  children: React.ReactNode | React.ReactNode[];
  className?: string;
}

const StyledLayout = styled('div')<ThemeProps>(({ theme: { extendToken, token } }: ThemeProps) => {
  return {
    display: 'flex',
    flex: 'auto',
    position: 'relative',

    '.web-layout-background': {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: -1,
      transitionDuration: 'background-color 0.3s ease',
      background: extendToken.tokensScreenInfoBackgroundColor,

      '&.__background-common': {
        background: token.colorBgDefault
      },
      '&.__background-info': {
        background: extendToken.tokensScreenInfoBackgroundColor
      },
      '&.__background-increase': {
        background: extendToken.tokensScreenSuccessBackgroundColor
      },
      '&.__background-decrease': {
        background: extendToken.tokensScreenDangerBackgroundColor
      }
    },

    '.web-layout-container': {
      display: 'flex',
      flexDirection: 'column'
    },

    '.web-layout-sidebar': {
      position: 'relative',
      height: '100vh',
      top: 0,
      display: 'flex',
      flexDirection: 'column'
    },

    '.web-layout-body': {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'auto',
      flex: 1
    },

    '&.header-type-common .web-layout-body': {
      height: '100vh',
      width: '100%'
    },

    '.web-layout-header': {
      flex: 0,
      padding: '24px 36px 24px 44px'
    },

    '.web-layout-content': {
      flex: 1,
      height: '100%',
      overflow: 'auto',

      '&.__with-padding': {
        padding: '0px 44px'
      }
    },

    '.setting-pages .ant-sw-screen-layout-body, .setting-pages .ant-sw-screen-layout-footer': {
      margin: '0 auto',
      width: extendToken.bigOneColumnWidth,
      maxWidth: '100%'
    },

    '.web-cancel-fill-height .ant-sw-screen-layout-body': {
      flex: 'initial'
    },

    '.ant-sw-screen-layout-container': {
      backgroundColor: 'transparent'
    },

    '.ant-sw-screen-layout-body': {
      display: 'flex',
      flexDirection: 'column'
    },

    '.web-single-column': {
      '.ant-sw-screen-layout-body, .ant-sw-screen-layout-footer': {
        width: extendToken.oneColumnWidth,
        maxWidth: '100%',
        marginLeft: 'auto',
        marginRight: 'auto'
      }
    },

    // Custom layout header
    '.ant-sw-screen-layout-header .ant-sw-header-container-center': {
      paddingTop: token.paddingLG,
      paddingBottom: token.paddingLG,

      '.ant-sw-header-left-part': {
        marginLeft: 0
      },

      '.ant-sw-header-center-part': {
        right: 'initial',
        left: 40,
        width: 'auto',

        '.ant-sw-sub-header-title-content': {
          fontSize: 30
        }
      }
    }
  };
});

const BaseWeb = ({ children }: LayoutBaseWebProps) => {
  const { t } = useTranslation();
  const { isWebUI } = useContext(ScreenContext);
  const { background, headerType, isPortfolio, isSettingPage, setSidebarCollapsed, showBackButtonOnHeader, showSidebar, sidebarCollapsed, title } = useContext(WebUIContext);
  const { goBack } = useDefaultNavigate();

  const headerTitle = useMemo(() => {
    if (isPortfolio) {
      return t('Portfolio');
    }

    return title;
  }, [isPortfolio, t, title]);

  if (!isWebUI) {
    return <>{children}</>;
  }

  return (
    <StyledLayout className={CN('web-layout-container', `header-type-${headerType}`)}>
      <div
        className={CN('web-layout-background', `__background-${background}`)}
      />
      {showSidebar && <div className='web-layout-sidebar'>
        <SideMenu
          isCollapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />
      </div>}

      <div className={CN('web-layout-body', { 'setting-pages': isSettingPage })}>
        {headerType === HeaderType.COMMON && <div className={'web-layout-header'}>
          <Headers.Controller title={headerTitle} />
        </div>}
        {headerType === HeaderType.COMMON_BACK && <div className={'web-layout-header'}>
          <Headers.Controller
            onBack={goBack}
            showBackButton={true}
            title={headerTitle}
          />
        </div>}
        {headerType === HeaderType.SIMPLE && <div className={'web-layout-header-simple'}>
          <Headers.Simple
            showBackButton={showBackButtonOnHeader}
            title={headerTitle}
          />
        </div>}
        <div className={CN('web-layout-content', { '__with-padding': showSidebar })}>
          {children}
        </div>
      </div>
    </StyledLayout>
  );
};

export default BaseWeb;
