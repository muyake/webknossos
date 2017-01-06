import _ from "lodash";
import Toast from "./toast";
import ErrorHandling from "./error_handling";
import pako from "pako";

const Request = {

  // IN:  nothing
  // OUT: json
  receiveJSON(url, options) {

    if (options == null) { options = {}; }
    return this.triggerRequest(
      url,
      _.defaultsDeep(options, { headers : { "Accept": "application/json" }}),
      this.handleEmptyJsonResponse
    );
  },


  // IN:  json
  // OUT: json
  sendJSONReceiveJSON(url, options) {

    // Sanity check
    // Requests without body should not send 'json' header and use 'receiveJSON' instead
    if (options == null) { options = {}; }
    if (!options.data) {
      if (options.method === "POST" || options.method === "PUT") {
        console.warn("Sending POST/PUT request without body", url);
      }
      return this.receiveJSON(url, options);
    }

    const body = typeof(options.data) === "string" ?
        options.data
      :
        JSON.stringify(options.data);

    return this.receiveJSON(
      url,
      _.defaultsDeep(options, {
        method : "POST",
        body,
        headers : {
          "Content-Type" : "application/json"
        }
      })
    );
  },


  // IN:  multipart formdata
  // OUT: json
  sendMultipartFormReceiveJSON(url, options) {

    if (options == null) { options = {}; }
    const toFormData = function(input, form, namespace) {
      const formData = form || new FormData();

      for (let key in input) {

        let formKey;
        const value = input[key];
        if (namespace) {
          formKey = `${namespace}[${key}]`;
        } else {
          formKey = key;
        }

        if (_.isArray(value)) {
          for (let val of value) {
            formData.append(`${formKey}[]`, val);
          }

        } else if (value instanceof File) {
          formData.append(`${formKey}[]`, value, value.name);

        } else if (_.isObject(value)) {
          toFormData(value, formData, key);

        } else { // string
          ErrorHandling.assert(_.isString(value));
          formData.append(formKey, value);
        }
      }

      return formData;
    };


    const body = options.data instanceof FormData ?
        options.data
      :
        toFormData(options.data);


    return this.receiveJSON(
      url,
      _.defaultsDeep(options, {
        method : "POST",
        body
      })
    );
  },


  // IN:  url-encoded formdata
  // OUT: json
  sendUrlEncodedFormReceiveJSON(url, options) {

    if (options == null) { options = {}; }
    const body = typeof options.data === "string" ?
        options.data
      :
        options.data.serialize();

    return this.receiveJSON(
      url,
      _.defaultsDeep(options, {
        method : "POST",
        body,
        headers : {
          "Content-Type" : "application/x-www-form-urlencoded"
        }
      }
      )
    );
  },


  receiveArraybuffer(url, options) {

    if (options == null) { options = {}; }
    return this.triggerRequest(
      url,
      _.defaultsDeep(options, { headers : { "Accept": "application/octet-stream" }}),
      response => response.arrayBuffer());
  },


  // IN:  arraybuffer
  // OUT: arraybuffer
  sendArraybufferReceiveArraybuffer(url, options) {

    if (options == null) { options = {}; }
    let body = options.data instanceof ArrayBuffer ?
        options.data
      :
        options.data.buffer.slice(0, options.data.byteLength);

    if (options.compress) {
      body = pako.gzip(body);
      options.headers["Content-Encoding"] = "gzip";
    }

    return this.receiveArraybuffer(
      url,
      _.defaultsDeep(options, {
        method : "POST",
        body,
        headers : {
          "Content-Type" : "application/octet-stream"
        }
      }
      )
    );
  },


  triggerRequest(url, options, responseDataHandler) {

    if (options == null) { options = {}; }
    const defaultOptions = {
      method : "GET",
      host : "",
      credentials : "same-origin",
      headers : {},
      doNotCatch : false,
      params : null
    };

    options = _.defaultsDeep(options, defaultOptions);

    if (options.host) {
      url = options.host + url;
    }

    // Append URL parameters to the URL
    if (options.params) {
      let appendix;
      const { params } = options;

      if (_.isString(params)) {
        appendix = params;
      } else if (_.isObject(params)) {
        appendix = _.map(params, (value, key) => `${key}=${value}`).join("&");
      } else {
        throw new Error("options.params is expected to be a string or object for a request!");
      }

      url += `?${appendix}`;
    }


    const headers = new Headers();
    for (let name in options.headers) {
      headers.set(name, options.headers[name]);
    }
    options.headers = headers;

    let fetchPromise = fetch(url, options)
      .then(this.handleStatus)
      .then(responseDataHandler);

    if (!options.doNotCatch) {
      fetchPromise = fetchPromise.catch(this.handleError);
    }

    if (options.timeout != null) {
      return Promise.race([ fetchPromise, this.timeoutPromise(options.timeout) ])
        .then(function(result) {
          if (result === "timeout") {
            throw new Error("Timeout");
          } else {
            return result;
          }
        });
    } else {
      return fetchPromise;
    }
  },


  timeoutPromise(timeout) {

    return new Promise( (resolve, reject) =>
      setTimeout(
        () => resolve("timeout"),
        timeout
      )
    );
  },


  handleStatus(response) {

    if (200 <= response.status && response.status < 400) {
      return Promise.resolve(response);
    }

    return Promise.reject(response);
  },


  handleError(error) {

    if (error instanceof Response) {
      return error.text().then(
        function(text) {
          try {
            const json = JSON.parse(text);

            // Propagate HTTP status code for further processing down the road
            json.status = error.status;

            Toast.message(json.messages);
            return Promise.reject(json);
          } catch (error) {
            Toast.error(text);
            return Promise.reject(text);
          }
        },
        function(error) {
          Toast.error(error.toString());
          return Promise.reject(error);
      });
    } else {
      Toast.error(error);
      return Promise.reject(error);
    }
  },


  handleEmptyJsonResponse(response) {

    const contentLength = parseInt(response.headers.get("Content-Length"));
    if (contentLength === 0) {
      return Promise.resolve({});
    } else {
      return response.json();
    }
  },


  // Extends the native Promise API with `always` functionality similar to jQuery.
  // http://api.jquery.com/deferred.always/
  always(promise, func) {

    return promise.then(func, func);
  }
};


export default Request;