// Copyright 2019-2022 @subwallet/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { createView, Popup } from '@subwallet/extension-web-ui';
import { workerMessageCenter } from '@subwallet/extension-web-ui/messaging';

const worker = new SharedWorker(new URL('./worker.ts', import.meta.url));

workerMessageCenter.setPort(worker.port);

createView(Popup);
