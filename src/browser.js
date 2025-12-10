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

import * as config from './config.js';
import * as messages from './messages.js';
import * as utils from './utils.js';

// Returns whether a permission change object is empty.
function permissionChangeEmpty(permissions_change) {
  return permissions_change.origins.length === 0 &&
         permissions_change.permissions.length === 0;
}

// Makes badge indicate that an action is pending.
export function displayLoading() {
  updateBadge(messages.LOADING_BADGE_DATA);
};

// Updates the specified properties of the badge.
export function updateBadge(data) {
  if ('icon' in data)
    chrome.action.setIcon({ path: data.icon });
  if ('text' in data)
    chrome.action.setBadgeText({ text: data.text });
  if ('title' in data)
    chrome.action.setTitle({ title: data.title });
  if ('color' in data)
    chrome.action.setBadgeBackgroundColor({ color: data.color });
};

// Returns the DOM element with the given id.
export function getElement(id) {
  return document.getElementById(id);
};

// Creates and return a DOM element with the given tag.
export function createElement(tag) {
  return document.createElement(tag);
};

// Creates and return a text element with the given value.
export function createTextNode(value) {
  return document.createTextNode(value);
};

// FetchError represents errors while attempting to fetch a URL.
export class FetchError {
  constructor(message, is_login_error) {
    this.message = message;
    this.is_login_error = is_login_error;
  }

  static wrap(json) {
    return new FetchError(json.message, json.is_login_error);
  }
}

// Returns a promise that will resolve to the content of the given path.
export async function fetchUrl(path, params, headers) {
  // Build URL with query parameters
  if (params) {
    var separator = '?';
    params.forEach(function(param) {
      var key = encodeURIComponent(String(param[0]));
      var val = encodeURIComponent(String(param[1]));
      path += separator + key + '=' + val;
      separator = '&';
    });
  }

  // Build fetch options
  const fetchOptions = {
    method: 'GET',
    credentials: 'include', // Include cookies for authentication
    headers: headers || {},
  };

  try {
    const response = await fetch(path, fetchOptions);

    if (response.ok) {
      return await response.text();
    } else if (response.status >= 400 && response.status <= 403) {
      // Authentication error, offer login.
      throw new FetchError("HTTP " + response.status + config.LOGIN_PROMPT, true);
    } else {
      throw new FetchError("HTTP " + response.status, false);
    }
  } catch (error) {
    if (error instanceof FetchError) {
      throw error;
    }
    // Network errors or CORS failures
    // These usually indicate a missing cookie (e.g., a redirect to a sign-in
    // service, which fails the request due to Chrome's CORS restrictions).
    throw new FetchError('Unknown error.' + config.LOGIN_PROMPT, true);
  }
}

// Sends a browser message, returning a promise for the result.
export function sendExtensionMessage(args, callback) {
  chrome.runtime.sendMessage(args, callback);
};

// Adds a callback to be notifier of extension message.
export function addExtensionMessageListener(callback) {
  chrome.runtime.onMessage.addListener(callback);
}

// Schedules a thunk to be called when all content is loaded.
export function callWhenLoaded(thunk) {
  window.addEventListener('DOMContentLoaded', thunk);
};

// Open a new tab displaying the given url, or activate the first
// tab displaying the given url if one exists.
export function openUrl(urlString, reuse_if_possible) {
  chrome.windows.getLastFocused({ populate: true }, function(currentWindow) {
    var candidates = currentWindow.tabs.filter(function(tab) {
      return tab.url == urlString && reuse_if_possible == true;
    });

    if (candidates.length == 0) {
      const url = new URL(urlString);
      // Setting the User Source Parameter (usp) such that Gerrit understands
      // that the user is coming from Gerrit Monitor.
      url.searchParams.set('usp', 'gerrit-monitor');
      chrome.tabs.create({ url: url.toString() });
    } else {
      var active = candidates.filter(function(tab) {
        return tab.active;
      });

      if (active.length != 0) {
        // If the active tab already present the given url, just close
        // the popup (as the activation will not close it automatically).
        // Note: window.close() only works in popup context, not service worker.
        if (typeof window !== 'undefined' && window.close) {
          window.close();
        }
      } else {
        chrome.tabs.update(candidates[0].id, { active: true }, function(tab) {
          // nothing to do.
        });
      }
    }
  });
};

// Loads options from storage and return a promise with the options.
export function loadOptions() {
  var promise = new Promise(function(resolve, reject) {
    chrome.storage.sync.get(config.DEFAULT_OPTIONS, function(options) {
      resolve(options);
    });
  });
  return promise.catch(() => {});
};

// Saves options to storage, returning a promise that will be resolved
// when the options are saved.
export function saveOptions(options) {
  options = utils.Map.wrap(options);
  return new Promise(function(resolve, reject) {
    var options_with_defaults = {};
    utils.Map.wrap(config.DEFAULT_OPTIONS).forEach(function(key, value) {
      if (options.has(key)) {
        options_with_defaults[key] = options.get(key);
      } else {
        options_with_defaults[key] = value;
      }
    });
    chrome.storage.sync.set(options_with_defaults, function() {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      resolve(options_with_defaults);
    });
  });
};

// Load values from local (non-synchronised) storage.
export function getLocalStorage(key, defaultVal) {
  return new Promise(function(resolve) {
    chrome.storage.local.get([key], (result) => {
      if (result[key] === undefined) {
        resolve(defaultVal);
      } else {
        resolve(result[key]);
      }
    });
  });
}

// Save the given value to local storage.
export async function setLocalStorage(key, val) {
  let result = {};
  result[key] = val;
  return new Promise(function (resolve) {
    chrome.storage.local.set(result, function() {
      resolve();
    });
  });
}

// Fetch all permissions granted to the extension.
export function getGrantedPermissions() {
  return new Promise(function(resolve, reject) {
    chrome.permissions.getAll(function(permissions) {
      resolve(permissions);
    });
  });
}

// Requests permissions needed for the extension.
export async function requestPermissions(origins, notifications) {
  var permissions = await getGrantedPermissions();
  var notifications_granted = permissions.permissions.includes('notifications');

  // In Manifest V3, host_permissions declared in manifest are already granted.
  // We only need to handle notifications as an optional permission.
  // Skip origin permission management since they're in host_permissions.

  // Handle notification permission
  if (notifications && !notifications_granted) {
    await new Promise(function(resolve, reject) {
      chrome.permissions.request({permissions: ['notifications']}, function(granted) {
        if (chrome.runtime.lastError) {
          console.warn('Notification permission request failed:', chrome.runtime.lastError.message);
          reject(new Error("notifications permission not granted"));
          return;
        }
        if (!granted) {
          reject(new Error("notifications permission not granted"));
          return;
        }
        resolve();
      });
    });
  } else if (!notifications && notifications_granted) {
    // Try to remove notification permission if user disabled it
    try {
      await new Promise(function(resolve) {
        chrome.permissions.remove({permissions: ['notifications']}, function(removed) {
          // Don't fail if we can't remove - just continue
          resolve();
        });
      });
    } catch (error) {
      // Ignore errors when removing permissions
    }
  }
}

// Opens the option page.
export function openOptionsPage() {
  chrome.runtime.openOptionsPage();
};

// Create a notification.
//
// The "url" parameter is used as the notification ID, and will be navigated to when
// the notification is clicked on.
export function createNotification(url, options) {
  // Note: In MV3, the notification click listener is registered in badge.js
  // at the top level of the service worker to ensure it survives restarts.
  chrome.notifications.create(url, options);
}

// Handle a click to a notification.
//
// When a notification is clicked, open a URL and clear the notification.
// This is exported so badge.js can register it as a listener.
export function notificationClicked(url) {
  openUrl(url, true);
  chrome.notifications.clear(url);
}
