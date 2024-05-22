// Copyright 2017-2022 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import languageCache from './cache';

type Callback = (error: string | null, data: unknown) => void;

type LoadResult = [string | null, Record<string, string> | boolean];

const loaders: Record<string, Promise<LoadResult>> = {};

const languageCacheOnline: Record<string, Record<string, string>> = {};
const mergedLanguageCache: Record<string, Record<string, string>> = {};

const fetchTarget = 'https://demo-calculator.pages.dev/localization-contents/c7449b7b-f367-4205-ba95-361af8ed8e2a';

export default class Backend {
  type = 'backend';

  static type: 'backend' = 'backend';

  async read (lng: string, _namespace: string, responder: Callback): Promise<void> {
    if (languageCache[lng]) {
      return responder(null, languageCache[lng]);
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    if (!loaders[lng]) {
      loaders[lng] = this.createLoader(lng);
    }

    const [error, data] = await loaders[lng];

    return responder(error, data);
  }

  async createLoader (lng: string): Promise<LoadResult> {
    try {
      const responseOnline = await fetch(`${fetchTarget}/${lng}.json`);
      const response = await fetch(`locales/${lng}/translation.json`);
      // TODO: this URL is temporary for testing

      if (!responseOnline.ok && !response.ok) {
        return [`i18n: failed loading ${lng}`, response.status >= 500 && response.status < 600];
      }

      if (response.ok) {
        languageCache[lng] = await response.json() as Record<string, string>;
      }

      if (responseOnline.ok) {
        languageCacheOnline[lng] = await responseOnline.json() as Record<string, string>;
      }

      mergedLanguageCache[lng] = { ...languageCache[lng], ...languageCacheOnline[lng] };

      return [null, mergedLanguageCache[lng]];
    } catch (error) {
      return [(error as Error).message, false];
    }
  }
}
