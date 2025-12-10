# Gerrit Monitor - Chrome Extension

A Chrome extension to monitor your code reviews on Gerrit.

> **Fork Notice**: This is a fork of [sdefresne/gerrit-monitor](https://github.com/sdefresne/gerrit-monitor), updated to support Chrome Manifest V3.

## About

Gerrit Monitor helps you stay on top of your code reviews by:

- Polling configured Gerrit servers every 5 minutes
- Displaying a badge with the number of CLs requiring your attention
- Showing categorized CLs in a popup (incoming reviews, outgoing needing attention, ready to submit, etc.)
- Sending optional desktop notifications for CLs that need your attention

## Version 2.0.0 - Manifest V3 Migration

This version includes a required migration to Chrome Manifest V3 with below changes:

- **Service Worker**: Replaced persistent background page with a module-based service worker
- **APIs**: `chrome.browserAction` ->  `chrome.action`, XMLHttpRequest -> Fetch API
- **Alarm-based Polling**: Uses `chrome.alarms` for periodic refresh
- **Proper Event Handling**: All event listeners registered at service worker top level

## Installation

{WIP}: Extension in the Chrome Web Store.

### From Source (Development)

1. Clone this repository
2. Navigate to `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `src/` directory

### Packaging

To deploy, you can use the `deploy.py` script or use the "Pack extension" button from `chrome://extensions`.

## Setup

After installing the extension:

1. Click on the extension icon
2. Click "Grant permissions" if prompted
3. Go to the Options page to configure your Gerrit instances

### Configuring Gerrit Hosts

From the options page, you can:

- Enable/disable pre-configured Gerrit instances (Chromium, Fuchsia, AOSP)
- Add custom Gerrit instances by providing a name and host URL

![Configure hosts](store/configure_hosts.png)

### Notifications

Enable desktop notifications to be alerted when:

- Incoming CLs require your attention
- Your outgoing CLs need action
- CLs are approved and ready to submit

### Attention Set

Gerrit Monitor supports the Attention Set feature. Configure this in the options to rely solely on Gerrit's attention set for determining which CLs need your attention.

![Configure Attention Set](store/configure_attention_set.png)

## License

The project is licensed under the Apache 2.0 license.

Every file containing source code must include copyright and license
information. This includes any JS/CSS files that you might be serving out to
browsers. (This is to help well-intentioned people avoid accidental copying that
doesn't comply with the license.)

Apache header:

    Copyright 2018 Google LLC

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        https://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

## Disclaimer

This is not an officially supported Google product.

