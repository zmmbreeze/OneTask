/**
 * Notify组件的后端库
 */

//@import "OneTask.js";
//@import "Event.js";
//@import "JSON2.js";

G.def('NotifyUtil', ['OneTask', 'Event', 'JSON2'], function( OneTask, Event, JSON2 ) {
    var interval = 30000,         // 间隔时间30喵
        localNotifyCount = -1,    // 通知的数量
        localMsgCount = -1;       // 站内信数量

    /**
     * Notify的后端工具类
     */
    function NotifyUtil() {
        // 注册修改时自动更新本地数量
        this.on('update', function( msgCount, notifyCount, notifyList ) {
            localNotifyCount = notifyCount == null ? localNotifyCount : notifyCount;
            localMsgCount = msgCount == null ?  localMsgCount : msgCount;
        });
    }
    NotifyUtil.prototype = {
        deleteNotify: function( id, success, error ) {
            var self = this;
            api.deleteNotify( id, '', function( data ) {
                self.fire( 'update', null, data.count, data.list, null, data.all );
                success && success();
            }, error);
        },
        deleteAllNotify: function( success, error ) {
            api.deleteNotify( '', 'all', function() {
                localMsgCount = 0;
                localNotifyCount = 0;
                success && success();
            }, error);
        },
        getNotifyList: function( success, error ) {
            api.getNotifyList( success, error );
        },
        onUpdate: function( callback ) {
            this.on( 'update', callback );
        }
    };
    Event.extend( NotifyUtil );

    var notify = new NotifyUtil(),
        task = new OneTask(
                    'N',
                    function( syncReturn ) {
                        api.getNotifyInfo(function( data ) {
                            syncReturn( data );
                        });
                    },
                    {interval: interval}
                );
    /*
     * 检查数据和本页面数据相比是否更新
     * @param {object} data
     */
    task.onChangeCallBack(function( data ) {
        if ( data != null && ( data.n !== localNotifyCount || data.m !== localMsgCount ) ) {
            // notifyCount不为0或空，且数字已更新，则请求数据
            if ( data.n ) {
                // 请求数据
                notify.getNotifyList(function( dataList ) {
                    notify.fire(
                        'update',
                        data.m,
                        data.n,
                        dataList
                    );
                });
            // 如果data.n为空或0则返回
            } else {
                notify.fire( 'update', data.m, data.n );
            }
        }
    }).start();
    // 因为html5 history api会触发unload所以只在使用cookie的时候执行
    if( task.useCookie ) {
        $(window).unload(function() {
            task.cancel();
        });
    }
    return notify;
});
