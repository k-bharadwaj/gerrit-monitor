// Copyright 2019 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Service worker for Manifest V3
// Event listeners must be registered synchronously at the top level

import * as browser from './browser.js';
import * as config from './config.js';
import * as gerrit from './gerrit.js';
import * as messages from './messages.js';
import * as notifications from './notifications.js';

// Variable used to cache the results of fetchReviews.
// Note: In MV3, this cache is cleared when the service worker terminates.
// For persistent caching, consider using chrome.storage.local.
var fetchCache = {};

// Fetches information about interesting CLs.
async function fetchCls(hosts) {
  if (hosts.length === 0) {
    throw new Error(config.NO_HOST_ALLOWED);
  }

  const now = new Date();

  // Fetch results from all hosts in parallel.
  let results = new Array();
  let errors = new Array();
  await Promise.allSettled(hosts.map(async (host) => {
    if (fetchCache[host]) {
      const [timestamp, cached] = fetchCache[host];
      if (now - timestamp < config.REVIEW_CACHE_DURATION_IN_MILLISECONDS) {
        if (cached.error) {
          errors.push({ host: host, error: cached.error });
        } else {
          results.push(cached.reviews);
        }
        return;
      }
    }

    try {
      const account = await gerrit.fetchAccount(host);
      const reviews = await gerrit.fetchReviews(host, account);
      fetchCache[host] = [new Date(), {reviews: reviews}];
      results.push(reviews);
    } catch (error) {
      fetchCache[host] = [new Date(), {error: error}];
      errors.push({ host: host, error: error });
    }
  }));

  return {
    results: new gerrit.SearchResults(results),
    errors: errors,
  };
}

async function fetchAndUpdate(hosts) {
  // Fetch results.
  let results = await fetchCls(hosts);

  // Update the badge.
  update(results);

  // Send any notifications.
  await notifications.notify(results.results, results.errors);

  return results;
}

// Updates the badge.
function update(wrapper) {
  // Re-schedule the function to be called later, cancelling any pending
  // alarm (as this is called when the user open the popup menu).
  chrome.alarms.clear('auto-refresh');
  chrome.alarms.create('auto-refresh', {
    delayInMinutes: config.REFRESH_DELAY_IN_MINUTES,
  });

  var updateData = null;
  if (wrapper.errors.length !== 0) {
    updateData = {
      text: '!',
      color: 'red',
      title: 'Error: ' + wrapper.errors[0].error.message,
      icon: {
        '24': 'img/ic_assignment_late_black_24dp_1x.png',
        '48': 'img/ic_assignment_late_black_24dp_2x.png',
      },
    };
  } else {
    var categories = wrapper.results.getCategoryMap();
    messages.SECTION_ORDERING.forEach(function(attention) {
      if (updateData != null)
        return;

      if (!categories.has(attention))
        return;

      var data = messages.BADGE_DATA[attention];
      if (data === null)
        return;

      var count = categories.get(attention).length;
      updateData = {
        text: String(count),
        icon: data.icon,
        title: data.formatTitle(count),
        color: data.color,
      };
    });
  }

  if (updateData === null)
    updateData = messages.DEFAULT_BADGE_DATA;

  browser.updateBadge(updateData);
}

// Automatically refresh the badge.
async function onAlarm() {
  try {
    const options = await browser.loadOptions();
    const instances = await gerrit.fetchAllowedInstances(options);
    const hosts = instances.map(function(instance) { return instance.host; });
    if (hosts.length > 0) {
      await fetchAndUpdate(hosts);
    }
  } catch (error) {
    console.error('Error in onAlarm:', error);
  }
}

// Creates a message listener that turns browser channel message into
// calls on the given object. All methods must return a promise and
// the result of the promise will be returned to the sender.
function newMessageProxy(handler) {
  return function(request, sender, reply) {
    var hasResponded = false;
    (handler[request[0]]).apply(handler, request.slice(1))
        .then(function(value) {
          reply({value: JSON.parse(JSON.stringify(value))});
          hasResponded = true;
        }, function(error) {
          reply({error: String(error)});
          hasResponded = true;
        });
    // If the promise is not yet fullfilled, return true to indicate that
    // the reply will be asynchronous.
    return !hasResponded;
  };
}

// Handler object for responding to requests from the popup.
class RequestProxy {
  constructor() {}

  // Returns the search results displayed in the popup. If no search
  // results are saved, then cause the badge to refresh.
  getSearchResults(hosts) {
    return fetchAndUpdate(hosts);
  }
}

// ============================================================================
// SERVICE WORKER EVENT LISTENERS
// These must be registered synchronously at the top level of the service worker
// ============================================================================

// Handle messages from popup
chrome.runtime.onMessage.addListener(newMessageProxy(new RequestProxy()));

// Handle notification clicks (must be registered at top level for MV3)
// Note: This will only work if the notifications permission is granted
if (chrome.notifications) {
  chrome.notifications.onClicked.addListener(browser.notificationClicked);
}

// Handle alarms for auto-refresh
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto-refresh') {
    onAlarm();
  }
});

// Handle service worker installation/startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('auto-refresh', {
    delayInMinutes: config.REFRESH_DELAY_IN_MINUTES,
  });
  onAlarm();
});

// Handle service worker startup (e.g., browser restart)
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get('auto-refresh', (alarm) => {
    if (!alarm) {
      chrome.alarms.create('auto-refresh', {
        delayInMinutes: config.REFRESH_DELAY_IN_MINUTES,
      });
    }
  });
  onAlarm();
});
