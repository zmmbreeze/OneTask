/**
 * 用于确保同一段代码在本地同域浏览器窗口之间，只有一个会执行任务，并且同步结果给其他窗口。
 * NOTE：只能尽量保证，因为不确定JS是否并行
 * NOTE: IE6、7，采用cookies传输信息，所以不能传输大批量信息
 * 实现原理：采用抢占式设计。后面加载的页面会抢占成为server。
 *           初始化结束后，不再抢占，只有server remove之后才会结束。
 *           server定时更新servertime，并共享给其他页面
 *           其他页面定时检查server状态和时间，如果server remove或关闭页面，则开始抢占
 *           第一个抢占成功的成为server。
 *
 * @author mzhou
 * @eg  var t =  new OneTask(
 *                  'Name',
 *                  function(syncReturn, n1, n2, n3) {
 *                      n1 === 1;
 *                      n2 === 2;
 *                      n3 === 3;
 *                      // 多个页面中只server会执行此函数
 *                      // syncReturn 将结果返回给回调函数
 *                      syncReturn({
 *                          'm':'11'
 *                       });
 *                  },
 *                  {
 *                      interval: 30000,        // 任务的运行间隔时间
 *                      serverTimeout: 1000,    // 服务器页面不活动后多久会认为它已经关闭
 *                      params: [1,2,3]         // 任务的参数
 *                  }
 *               );
 *      t.start();
 *      t.stop();
 *      // 注册定时回调，此函数会在当前页面的任务运行而定时运行
 *      t.onCallBack(function(data) {
 *          this === t;
 *          data.m === 11;
 *      });
 *      // 注册任务返回数据更新时候的回调函数，此函数不会随着任务结束而定时运行
 *      t.onChangeCallBack(function(data) {
 *          this === t;
 *          data.m === 11;
 *      });
 *      NOTE: 上面两个任务执行结果的回调函数，输入为任务的执行结果
 *            this为当前任务对象
 *            返回结果如果是null，则是处于切换阶段，不能将null作为正常结果处理
 *
 * @log 第一版实现
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
                 * 构建onSorage函数
                 * @param {string} key 键值
                 * @param {function} callback 回调函数
                 */
                var createOnStorage = function (key, callback) {
                    var oldValue = lc[key];
                    return function(e) {
                        // setTimeout: bugfix for IE
                        setTimeout(function() {
                            e = e || window.storageEvent;

                            var changedKey = e.key,
                                newValue = e.newValue;
                            // IE 不支持key、newValue
                            if(!changedKey) {
                                var nv = lc[key];
                                if(nv != oldValue) { // 通过值是否相等来判断
                                    changedKey = key;
                                    newValue = nv;
                                }
                            }

                            if(changedKey == key) {
                                if (callback) {
                                    callback(
                                        newValue == null ? null : JSON.parse(newValue)
                                    ); // 解析
                                }
                                oldValue = newValue;    // 更新值
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
                // NOTE: IE在自己修改数据的时候也会收到消息
                api.onStorage = function(key, callback) {
                    if(window.addEventListener) {
                        window.addEventListener('storage', createOnStorage(key, callback), false);
                    } else{
                        // IE 在document上
                        document.attachEvent('storage', createOnStorage(key, callback));
                    }
                };
                api.isSupport = true;
            }
            return api;
        })(),
        cookies = {
            /**
             * 获取cookies中key为name的值
             * @param {string} name key值
             * @return {string} 返回对应值，如果没有则返回''
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
             * 设置cookies的值
             * @param {string} name key值
             * @param {string} val 值
             * @param {object} expired 过期时间的date对象
             * @param {string} path 路径对象
             * @param {object} 对象本身
             */
            set: function(name, val, expired, path) {
                document.cookie = name + '=' + escape(val) + ((expired == null) ? '' : ';expires=' + expired.toGMTString()) + ';path=' + (path || '/');
                return this;
            },
            /**
             * 删除cookies
             * @param {string} name
             * @param {string} path
             */
            remove: function(name, path) {
                var exp = new Date();
                exp.setTime(exp.getTime() - 1); // 设置过期时间
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
     * 任务类
     * @param {string} name 任务名
     * @param {function} asyncJob 任务执行函数
     *                       参数为syncReturn函数，将返回数据传给return，OneTask会帮你把数据同步发给其他页面。
     *                       其他参数通过option.params传递
     * @param {object} option 可选参数：
     *                      params: 【数组/或单个参数】传给asyncJob的参数,尽可能少用params参数
     *                      serverTimeout: 【数字】服务器的不在线
     *                      interval: 【数字】任务的间隔执行时间，默认30秒
     */
    function Task(name, asyncJob, option) {
        this.name = 'T' + name; // 任务名，被用作key
        this.serverTimeKey = this.name + 'T'; // 服务器时间的key
        this.jobMsgKey = this.name + 'M'; // 任务消息的key
        this.asyncJob = asyncJob; // 异步任务
        this.jobMsg = null; // 任务信息，默认为null
        // （因为任务切换时候get方法得到的为null）
        this.isServer = false; // 是否是server
        this.params = option && option.params; // 任务参数
        this.serverTimeout = (option && option.serverTimeout) || 2000; // 服务器timeout
        this.intervalTime = (option && option.interval) || 30000; // 任务执行间隔
        this.timeUpdateInterval = 0; // server更新服务器时间的间隔 定时器句柄
        this.jobRunInterval = 0; // 任务执行间隔 定时器句柄
        this.serverCheckInterval = 0; // 检查服务器状态 定时器句柄
        this.isRunning = false; // 是否正在运行
        this.inited = false; // 
        var self = this;
        // 设置callback 与定时器
        function run() { // self.run函数的包装
            self._run();
        }
        self.callback = function(msg, isJSON) {
            self.fire('callback', isJSON ? msg : JSON.parse(msg));
            self.jobRunInterval = setTimeout(run, self.intervalTime);
        };
    }

    /**
     * 只有server会执行任务，其他页面上的callback会在run时得到任务结果
     */
    Task.prototype._run = function() {
        var self = this;
        if (!self.isRunning) { // 没有运行则停止
            return this;
        }
        if (self.isServer) {
            // 处理syncJob返回的data
            var syncReturnResolve = function (data) {
                // 重新check，避免在执行过程中被抢占（即使被抢占了也没关系，过一段时间就会平稳）
                if (self.isServer) {
                    // 执行到此处还是有可能被抢占，所以抢占成功后一定要清楚Msg
                    var msg = JSON.stringify(data);
                    set(self.jobMsgKey, msg);
                    if (self.jobMsg !== msg) {
                        self.fire('changeCallBack', data);
                        self.jobMsg = msg;
                    }
                    self.callback(data, true);
                } else {
                    // 从服务器获取信息
                    self.callback(self.jobMsg);
                }
            };
            if (this.params) {
                // concat会多生成数组，为了性能尽可能少用params参数
                self.asyncJob.apply(self, [syncReturnResolve].concat(this.params));
            } else {
                self.asyncJob.call(self, syncReturnResolve);
            }
        } else {
            // 从服务器获取信息
            self.callback(self.jobMsg);
        }
        return this;
    };

    /**
     * 开始任务
     */
    Task.prototype.start = function() {
        var self = this;
        if (self.isRunning) {
            return this;
        }
        self.isRunning = true;

        // 抢占成为server
        self.switchToServer();

        // 支持且未初始化时，绑定onStorage事件
        /*if (store.isSupport && !self.inited) {
            // 获取最新消息并存储
            store.onStorage(self.jobMsgKey, function(msg) {
                if (self.isRunning && self.jobMsg !== msg) {
                    self.jobMsg = msg;
                    self.fire('changeCallBack', JSON.parse(msg));
                }
            });
        }*/
        // 定时检查server是否宕机，以及cookies是否更新
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
            var serverTime = parseInt(get(self.serverTimeKey), 10) || 0,
                // 可能返回为NaN
                now = new Date().getTime();
            // 如果没有设置服务器时间，或者是服务器超时了，则开始抢占
            if (!serverTime || ((now - serverTime) > self.serverTimeout)) {
                self.switchToServer();
            }

            if (/*!store.isSupport &&*/ self.isRunning) {
                // 获取最新消息并存储
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
     * 停止任务,注意由于异步任务的存在，无法立即停止任务
     */
    Task.prototype.stop = function() {
        var self = this;
        self.isRunning = false;
        self.switchToClient();
        clearInterval(self.serverCheckInterval);
        return this;
    };

    /**
     * 关闭任务，以后不再使用
     */
    Task.prototype.cancel = function() {
        // 清楚记录
        // 但是有可能client切换成server之前被关闭，所以不能保证完全清除掉存储数据
        if (this.isServer) {
            remove(this.name);
            remove(this.serverTimeKey);
            remove(this.jobMsgKey);
        }
        // 清楚定时器
        clearInterval(this.timeUpdateInterval);
        clearTimeout(this.jobRunInterval);
        clearInterval(this.serverCheckInterval);
        return this;
    };

    /**
     * 查询设置isServer的状态值
     */
    Task.prototype.check = function(nowServer) {
        var self = this;
        nowServer = nowServer || get(self.name);
        // 未设置
        if (!nowServer) {
            self.switchToServer();
            // 不是自己
        } else if (nowServer !== pageId) {
            self.isServer = false;
            // 是自己
        } else {
            self.isServer = true;
        }
        return this;
    };

    /**
     * 切换成为server，强制抢占
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
            // 如果被别人抢占了
            if (get(self.name) !== pageId) {
                clearInterval(self.timeUpdateInterval);
                // 更新时间
            } else {
                set(self.serverTimeKey, new Date().getTime());
            }
        }, self.serverTimeout / 2);
        return this;
    };

    /*
     * 切换成为客户端
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

    // 是否使用cookie来传输数据，此时无法传大批量数据
    Task.prototype.useCookie = !store.isSupport;

    /*
     * 注册定时回调，此函数会在当前页面的任务运行而定时运行
     */
    Task.prototype.onChangeCallBack = function(callback) {
        this.on('changeCallBack', callback, this);
        return this;
    };

    /*
     * 注册任务返回数据更新时候的回调函数，此函数不会随着任务结束而定时运行
     */
    Task.prototype.onCallBack = function(callback) {
        this.on('callback', callback, this);
        return this;
    };

    /**
     * 注册事件
     * @param {string} name 事件名
     * @param {function} callback 事件的回调函数
     * @param {object} context 【可选】回调函数的this值
     * @param {boolean} once 【可选】是否只执行一次
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
     * 取消注册事件
     * @param {string} name
     * @param {function} callback 【可选】指定要取消的回调函数
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
     * 激活事件
     * @param {string} name
     * @param {object} data 传递给事件回调函数的参数值
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
