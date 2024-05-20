// Copyright 2017-2022 @polkadot/react-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import languageCache from './cache';

type Callback = (error: string | null, data: unknown) => void;

type LoadResult = [string | null, Record<string, string> | boolean];

const loaders: Record<string, Promise<LoadResult>> = {};

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
      let response = await fetch(`${fetchTarget}/${lng}.json`);
      // TODO: this URL is temporary for testing

      if (!response.ok) {
        console.log(`First fetch failed with status: ${response.status}`);
        response = await fetch(`locales/${lng}/translation.json`);

        if (!response.ok) {
          console.log(`Second fetch failed with status: ${response.status}`);

          return [`i18n: failed loading ${lng}`, response.status >= 500 && response.status < 600];
        }
      }

      languageCache[lng] = await response.json() as Record<string, string>;

      return [null, languageCache[lng]];
    } catch (error) {
      return [(error as Error).message, false];
    }
  }
}
