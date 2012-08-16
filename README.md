One task for each browser
===========================

OneTask is a simple javascript libary to make sure a timing task only execute in one page for each browser.

Example
---------------

Check out the index.html

API
--------------

    var t =  new OneTask(
                'Name',
                function(syncReturn, n1, n2, n3) {
                    // only server page run this function(Task)
                    n1 === 1;
                    n2 === 2;
                    n3 === 3;
                    // syncReturn: return the result of task
                    // result will be serialize to json string
                    syncReturn({
                      'm':'11'
                    });
                },
                {
                    interval: 30000,        // interval of task
                    serverTimeout: 1000,    // timeout of server
                    params: [1,2,3]         // task params
                }
            );
    // cancel the task, and can't start again
    t.cancel();
    // start the task
    t.start();
    // temporarily stop the task
    t.stop();
    // regist callback，which runs after the task
    // parameter of callback is the result of task
    t.onCallBack(function(data) {
      this === t;
      data.m === 11;
    });
    // regist callback，which runs when the result change
    // parameter of callback is the result of task
    t.onChangeCallBack(function(data) {
      this === t;
      data.m === 11;
    });

    NOTE: if the result of task is null, it means task is not ready. It's not a right result, don't use it;
