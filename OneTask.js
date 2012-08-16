/**
 * OneTask
 * Only one task for each browser~
 *
 * @author mzhou
 * @eg  var t =  new OneTask(
 *                  'Name',
 *                  function(syncReturn, n1, n2, n3) {
 *                      // only server page run this function(Task)
 *                      n1 === 1;
 *                      n2 === 2;
 *                      n3 === 3;
 *                      // syncReturn: return the result of task
 *                      // result will be serialize to json string
 *                      syncReturn({
 *                          'm':'11'
 *                       });
 *                  },
 *                  {
 *                      interval: 30000,        // interval of task
 *                      serverTimeout: 1000,    // timeout of server
 *                      params: [1,2,3]         // task params
 *                  }
 *               );
 *      // cancel the task, and can't start again
 *      t.cancel();
 *      // start the task
 *      t.start();
 *      // temporarily stop the task
 *      t.stop();
 *      // regist callback，which runs after the task
 *      // parameter of callback is the result of task
 *      t.onCallBack(function(data) {
 *          this === t;
 *          data.m === 11;
 *      });
 *      // regist callback，which runs when the result change
 *      // parameter of callback is the result of task
 *      t.onChangeCallBack(function(data) {
 *          this === t;
 *          data.m === 11;
 *      });
 *
 *      NOTE: if the result of task is null, it means task is not ready. It's not a right result, don't use it;
 *
 * @log 0.1 inited
 *
 */

/*jshint undef:true, browser:true, noarg:true, curly:true, regexp:true, newcap:true, trailing:false, noempty:true, regexp:false, strict:true, evil:true, funcscope:true, iterator:true, loopfunc:true, multistr:true, boss:true, eqnull:true, eqeqeq:false, undef:true */
/*global unescape:false, escape:false */

var OneTask = (function() {
    'use strict';
    var store = (function() {
            var isSupport = 'localStorage' in window,
                api = {
                    set: function(){},
                    get: function(){},
                    remove: function() {},
                    clear: function() {},
                    isSupport: false
                };
            if (isSupport) {
                var lc = window.localStorage;
                /**
                 * create onSorage callback
                 * @param {string} key
                 * @param {function} callback
                 */
                var createOnStorage = function (key, callback) {
                    var oldValue = lc[key];
                    return function(e) {
                        // setTimeout: bugfix for IE
                        setTimeout(function() {
                            e = e || window.storageEvent;

                            var changedKey = e.key,
                                newValue = e.newValue;
                            // IE not support key and newValue
                            if(!changedKey) {
                                var nv = lc[key];
                                if(nv != oldValue) { // if changed
                                    changedKey = key;
                                    newValue = nv;
                                }
                            }

                            if(changedKey == key) {
                                if (callback) {
                                    callback(
                                        newValue == null ? null : JSON.parse(newValue)
                                    );
                                }
                                oldValue = newValue;    // update oldValue
                            }
                        }, 0);
                    };
                };
                api.set = function(key, value) {
                    lc.setItem(key, JSON.stringify(value));
                };
                api.get = function(key) {
                    var i = lc.getItem(key);
                    return i == null ? null : JSON.parse(i);
                };
                api.remove = function(key) {
                    lc.removeItem(key);
                };
                api.clear = function() {
                    lc.clear();
                };
                // NOTE: IE will trigger the event, when modify the data itself
                api.onStorage = function(key, callback) {
                    if(window.addEventListener) {
                        window.addEventListener('storage', createOnStorage(key, callback), false);
                    } else{
                        document.attachEvent('storage', createOnStorage(key, callback));
                    }
                };
                api.isSupport = true;
            }
            return api;
        })(),
        cookies = {
            /**
             * get cookies
             * @param {string} name key name
             * @return {string} value, if not exist return ''
             */
            get: function(name) {
                if (document.cookie.length > 0) {
                    var e, s = document.cookie.indexOf(name + '=');
                    if (s != -1) {
                        s = s + name.length + 1;
                        e = document.cookie.indexOf(';', s);
                        if (e == -1) {
                            e = document.cookie.length;
                        }
                        return unescape(document.cookie.substring(s, e));
                    }
                }
                return '';
            },
            /**
             * set cookies
             * @param {string} name key
             * @param {string} val value
             * @param {object} expired expired time (Date object)
             * @param {string} path
             */
            set: function(name, val, expired, path) {
                document.cookie = name + '=' + escape(val) + ((expired == null) ? '' : ';expires=' + expired.toGMTString()) + ';path=' + (path || '/');
                return this;
            },
            /**
             * remove cookies
             * @param {string} name
             * @param {string} path
             */
            remove: function(name, path) {
                var exp = new Date();
                exp.setTime(exp.getTime() - 1); // set expired time
                var val = this.get(name);
                if (val != null) {
                    document.cookie = name + "=" + val + ";expires=" + exp.toGMTString() + ';path=' + (path || '/');
                }
            }
        },
        ArrayProto = Array.prototype,
        ObjProto = Object.prototype,
        slice = ArrayProto.slice,
        nativeFilter = ArrayProto.filter,
        pageId = location.pathname + '?' + new Date().getTime() + Math.random(),
        /*
         * delegation of localStorage and cookie
         */
        set = store.isSupport ? store.set : function(key, value) {
            cookies.set(key, JSON.stringify(value));
        },
        get = store.isSupport ? store.get : function(key) {
            var v = cookies.get(key);
            return v ? JSON.parse(v) : null;
        },
        remove = store.isSupport ? store.remove : function(key) {
            cookies.remove(key);
        },
        // forEach
        each = function(array, iterator, context) {
            var value;
            if (array == null) {
                return;
            }

            if (ArrayProto.forEach && array.forEach === ArrayProto.forEach) {
                array.forEach(iterator, context);
            } else if (typeof array.length === 'number') {
                for (var i = 0, l = array.length; i < l; i++) {
                    if (i in array) {
                        iterator.call(context, array[i], i, array);
                    }
                }
            } else {
                for (var key in array) {
                    if (ObjProto.hasOwnProperty.call(array, key)) {
                        iterator.call(context, array[key], key, array);
                    }
                }
            }
        },
        // filter
        filter = function(array, iterator, context) {
            var results = [];
            if (array == null) {
                return;
            }

            if (nativeFilter && array.filter === nativeFilter) {
                return array.filter(iterator, context);
            } else {
                each(array, function(value, index, list) {
                    if (iterator.call(context, value, index, list)) {
                        results.push(value);
                    }
                });
                return results;
            }
        };

    /**
     * Task class
     * @param {string} name task name
     * @param {function} asyncJob task function
     * @param {object} option
     *                      params: [array/object] params for asyncJob
     *                      serverTimeout: [number] timeout of server, default: 2s
     *                      interval: [number] interval of task function, default: 3s
     */
    function Task(name, asyncJob, option) {
        this.name = 'T' + name;                                         // key of task name
        this.serverTimeKey = this.name + 'T';                           // key of server time
        this.jobMsgKey = this.name + 'M';                               // key of task result(message)
        this.asyncJob = asyncJob;
        this.jobMsg = null;                                             // task result, default: null
        this.isServer = false;
        this.params = option && option.params;                          // parameters for task
        this.serverTimeout = (option && option.serverTimeout) || 2000;
        this.intervalTime = (option && option.interval) || 30000;
        this.timeUpdateInterval = 0;                                    // interval to update server time
        this.jobRunInterval = 0;                                        // interval to run task
        this.serverCheckInterval = 0;                                   // interval to check server state
        this.isRunning = false;
        this.inited = false;
        var self = this;
        // set callback
        function run() {
            self._run();
        }
        self.callback = function(msg, isJSON) {
            self.fire('callback', isJSON ? msg : JSON.parse(msg));
            self.jobRunInterval = setTimeout(run, self.intervalTime);
        };
    }

    /**
     * only server can run the task
     */
    Task.prototype._run = function() {
        var self = this;
        if (!self.isRunning) {
            return this;
        }
        if (self.isServer) {
            // resolve the result of syncReturn method
            var syncReturnResolve = function (data) {
                // check again, make sure it is server
                if (self.isServer) {
                    var msg = JSON.stringify(data);
                    set(self.jobMsgKey, msg);
                    if (self.jobMsg !== msg) {
                        self.fire('changeCallBack', data);
                        self.jobMsg = msg;
                    }
                    self.callback(data, true);
                } else {
                    self.callback(self.jobMsg);
                }
            };
            if (this.params) {
                self.asyncJob.apply(self, [syncReturnResolve].concat(this.params));
            } else {
                self.asyncJob.call(self, syncReturnResolve);
            }
        } else {
            self.callback(self.jobMsg);
        }
        return this;
    };

    /**
     * start task
     */
    Task.prototype.start = function() {
        var self = this;
        if (self.isRunning) {
            return this;
        }
        self.isRunning = true;

        self.switchToServer();

        // bind onStorage event
        if (store.isSupport && !self.inited) {
            store.onStorage(self.jobMsgKey, function(msg) {
                // get result, store and fire callback
                if (self.isRunning && self.jobMsg !== msg) {
                    self.jobMsg = msg;
                    self.fire('changeCallBack', JSON.parse(msg));
                }
            });
        }
        // check server status
        self.serverCheckInterval = setInterval(function() {
            self.check();
            // document.title = ''
            //    + (self.useCookie ? '(C)' : '(S)')
            //    + (self.isServer ? 'Server' : 'Client')
            //    + JSON.stringify(self.jobMsg)
            //    + new Date().getSeconds();
            if (self.isServer) {
                return;
            }
            // server time maybe NaN, so default value is 0
            var serverTime = parseInt(get(self.serverTimeKey), 10) || 0,
                now = new Date().getTime();
            // if no server or server is down, then switch to server
            if (!serverTime || ((now - serverTime) > self.serverTimeout)) {
                self.switchToServer();
            }

            if (!store.isSupport && self.isRunning) {
                // get result, store and fire callback
                var msg = get(self.jobMsgKey);
                if (self.jobMsg !== msg) {
                    self.jobMsg = msg;
                    self.fire('changeCallBack', JSON.parse(msg));
                }
            }
        }, this.serverTimeout / 2);

        self._run();
        self.inited = true;
        return this;
    };

    /**
     * stop task
     */
    Task.prototype.stop = function() {
        var self = this;
        self.isRunning = false;
        self.switchToClient();
        clearInterval(self.serverCheckInterval);
        return this;
    };

    /**
     * cancel task, can't start again
     */
    Task.prototype.cancel = function() {
        // remove data but not sure it does
        if (this.isServer) {
            remove(this.name);
            remove(this.serverTimeKey);
            remove(this.jobMsgKey);
        }
        // clear interval
        clearInterval(this.timeUpdateInterval);
        clearTimeout(this.jobRunInterval);
        clearInterval(this.serverCheckInterval);
        return this;
    };

    /**
     * check server status, and set isServer
     */
    Task.prototype.check = function(nowServer) {
        var self = this;
        nowServer = nowServer || get(self.name);
        // no server
        if (!nowServer) {
            self.switchToServer();
        // server is not itself
        } else if (nowServer !== pageId) {
            self.isServer = false;
        // is server
        } else {
            self.isServer = true;
        }
        return this;
    };

    /**
     * switch to server
     * must be success
     */
    Task.prototype.switchToServer = function() {
        var self = this;
        if (self.isServer) {
            return this;
        }
        self.isServer = true;
        set(self.name, pageId);
        set(self.serverTimeKey, new Date().getTime());
        self.timeUpdateInterval = setInterval(function() {
            // if server was changed
            if (get(self.name) !== pageId) {
                clearInterval(self.timeUpdateInterval);
            // update server time
            } else {
                set(self.serverTimeKey, new Date().getTime());
            }
        }, self.serverTimeout / 2);
        return this;
    };

    /**
     * switch to client
     * maybe not success
     */
    Task.prototype.switchToClient = function() {
        var self = this;
        if (!self.isServer) {
            return this;
        }
        self.isServer = false;
        remove(self.name);
        remove(self.serverTimeKey);
        clearInterval(self.timeUpdateInterval);
        return this;
    };

    // use cookie to store data or not
    Task.prototype.useCookie = !store.isSupport;

    /*
     * regist callback，which runs after the task
     * parameter of callback is the result of task
     */
    Task.prototype.onChangeCallBack = function(callback) {
        this.on('changeCallBack', callback, this);
        return this;
    };

    /*
     * regist callback，which runs when the result change
     * parameter of callback is the result of task
     */
    Task.prototype.onCallBack = function(callback) {
        this.on('callback', callback, this);
        return this;
    };

    /**
     * regist event
     * @param {string} name event name
     * @param {function} callback
     * @param {object} context
     * @param {boolean} once only run once
     * @return {object} this
     */
    Task.prototype.on = function(name, callback, context, once) {
        this.eventQueue = this.eventQueue || {};
        this.eventQueue[name] = this.eventQueue[name] || [];
        this.eventQueue[name].push({
            callback: callback,
            context: context,
            once: once
        });
        return this;
    };

    /**
     * cancel registration
     * @param {string} name
     * @param {function} callback
     * @return {object} this
     */
    Task.prototype.off = function(name, callback) {
        this.eventQueue = this.eventQueue || {};
        if (this.eventQueue[name] == null) {
            return;
        }
        if (callback) {
            this.eventQueue[name] = filter(this.eventQueue[name], function(value, index) {
                return value.callback !== callback;
            });
            if (this.eventQueue[name].length === 0) {
                delete this.eventQueue[name];
            }
        } else {
            delete this.eventQueue[name];
        }
        return this;
    };

    /**
     * fire event
     * @param {string} name
     * @param {object} data event data
     * @return {object} this
     */
    Task.prototype.fire = function(name, data) {
        this.eventQueue = this.eventQueue || {};
        var q = this.eventQueue[name],
            r = true;
        if (q) {
            var arg = slice.call(arguments, 1);
            each(q, function(value) {
                if (value.callback.apply(value.context, arg) === false) {
                    r = false;
                }
                if (value.once) {
                    this.off(name, value.callback);
                }
            }, this);
        }
        return r;
    };

    return Task;
})();
