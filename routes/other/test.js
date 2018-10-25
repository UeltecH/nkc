const Router = require('koa-router');

const testRouter = new Router();

testRouter
  .get('/', async (ctx, next) => {
    const t = Date.now();
    const {data, db, nkcModules, query} = ctx;
    const {page = 0} = query;
    const user = data.user;
    // const user = await db.UserModel.findOne({uid: '10'});
    const gradeId = data.userGrade._id;
    const rolesId = data.userRoles.map(r => r._id);
    const options = {
      gradeId,
      rolesId,
      uid: data.user?data.user.uid:''
    };
    const f2 = await db.ForumModel.getThreadForumsId(rolesId);
    /*const r1 = Date.now();
    const fidOfCanGetThreads = await db.ForumModel.fidOfCanGetThreads(options);
    const r2 = Date.now();
    const f2 = await db.ForumModel.getThreadForumsId(rolesId);
    const r3 = Date.now();
    console.log(`old: ${r2 - r1}ms, new: ${r3 - r2}ms`);
    console.log(fidOfCanGetThreads.length, f2.length);
    for(const f of fidOfCanGetThreads) {
      if(!f2.includes(f)) console.log(f);
    }*/
    // 1. 取到用户所有发表的帖子id
    // 2. 取到用户所有关注的帖子id
    /*const userThreads = await db.ThreadModel.find({uid: user.uid, fid: {$in: fidOfCanGetThreads}}, {tid: 1, _id: 0}).sort({tlm: -1});
    let tidArr = userThreads.map(t => t.tid);
    const collections = await db.CollectionModel.find({uid: user.uid, fid: {$in: fidOfCanGetThreads}}, {tid: 1, _id: 0});
    const collectionsId = collections.map(c => c.tid);
    tidArr = tidArr.concat(collectionsId);
    const q = {
      tid: {
        $in: tidArr
      }
    };

    const count = await db.ThreadModel.count(q);
    const paging = nkcModules.apiFunction.paging(page, count);

    const results = [];
    const threads = await db.ThreadModel.find(q, {uid: 1, tid: 1, toc: 1, oc: 1, lm: 1, tlm: 1}).skip(paging.start).limit(paging.perpage).sort({tlm: -1});
    for(const thread of threads) {
      thread.firstPost = await db.PostModel.findOne({pid: thread.oc});
      thread.lastPost = await db.PostModel.findOne({pid: thread.lm});
      if(!thread.lastPost || !thread.firstPost) continue;
      results.push({
        type: 'thread',
        t: thread.tlm,
        thread
      });
    }*/


    const friends = await db.FriendModel.find({uid: user.uid});
    const friendsId = friends.map(f => f.tUid);

    const userSubscribe = await db.UsersSubscribeModel.findOne({uid: user.uid});
    const subscribeForums = userSubscribe.subscribeForums;
    let subscribeForumsId = [];
    for(const fid of subscribeForums) {
      subscribeForumsId.push(fid);
      const childrenFid = await db.ForumModel.getAllChildrenFid(fid);
      subscribeForumsId = subscribeForumsId.concat(childrenFid);
    }
    const q = {
      fid: {$in: f2},
      $or: [
        // 自己的文章与回复
        {
          uid: user.uid
        },
        // 好友的文章与回复
        {
          uid: {
            $in: friendsId
          }
        },
        // 关注的专业里边的文章与回复
        {
          fid: {
            $in: subscribeForumsId
          }
        }

      ]
    };

    const count = await db.ThreadModel.count(q);
    const paging = nkcModules.apiFunction.paging(page, count);
    data.paging = paging;

    const results = [];
    const threads = await db.ThreadModel.find(q, {uid: 1, tid: 1, toc: 1, oc: 1, lm: 1, tlm: 1}).skip(paging.start).limit(paging.perpage).sort({tlm: -1});
    for(const thread of threads) {
      thread.firstPost = await db.PostModel.findOne({pid: thread.oc});
      thread.lastPost = await db.PostModel.findOne({pid: thread.lm});
      if(!thread.lastPost || !thread.firstPost) continue;
      results.push({
        type: 'thread',
        t: thread.tlm,
        thread
      });
    }

    const arr = [];

    const latestThread = await db.ThreadModel.findOne().sort({toc: -1});
    latestThread.firstPost = await db.PostModel.findOne({pid: latestThread.oc});
    latestThread.lastPost = await db.PostModel.findOne({pid: latestThread.lm});
    const digestThread = await db.ThreadModel.findOne({digest: true}).sort({digestTime: -1});
    digestThread.firstPost = await db.PostModel.findOne({pid: latestThread.oc});
    digestThread.lastPost = await db.PostModel.findOne({pid: latestThread.lm});


    arr.push({
      type: 'latest',
      thread: latestThread,
      t: latestThread.toc
    });
    arr.push({
      type: 'digest',
      thread: digestThread,
      t: digestThread.digestTime
    });


    const t1 = Date.now();

    const chat = await db.CreatedChatModel.find({uid: user.uid});

    await Promise.all(chat.map(async c => {
      if(c.tUid !== user.uid) {
        const message = await db.MessageModel.findOne({_id: c.lmId});
        if(!message) return;
        let sUser, rUser;
        if(message.s === user.uid) {
          sUser = user;
          rUser = await db.UserModel.findOnly({uid: message.r});
        } else {
          rUser = user;
          sUser = await db.UserModel.findOnly({uid: message.s});
        }
        arr.push({
          type: 'message',
          t: message.tc,
          message,
          sUser,
          rUser
        });
      }
    }));

    const t2 = Date.now();


    for(const fid of subscribeForums) {
      const forum = await db.ForumModel.findOne({fid});
      const latestThread = await db.ThreadModel.findOne({fid}).sort({toc: -1});
      if(!latestThread) continue;
      latestThread.firstPost = await db.PostModel.findOne({pid: latestThread.oc});
      latestThread.lastPost = await db.PostModel.findOne({pid: latestThread.lm});

      arr.push({
        type: 'forum',
        t: latestThread.toc,
        forum,
        latestThread
      })
    }

    const t3 = Date.now();

    const hasThread = count > 0;
    const pageCount = paging.pageCount;
    const isFirstPage = paging.page === 0;
    let isLastPage = false;
    if(paging.page + 1 === paging.pageCount) {
      isLastPage = true;
    } else if(paging.page >= paging.pageCount) {
      ctx.throw(400, '分页数超出范围');
    }

    let lastThreadTime;
    if(!isFirstPage) {
      const lastThread = await db.ThreadModel.findOne(q).skip(paging.start-1).limit(1).sort({tlm: -1});
      lastThreadTime = lastThread.tlm;
    }

    // 没有关于文章信息或文章信息只有一页，只需要将全部信息按时间排序即可
    if(!hasThread || pageCount === 0) {
      for(const a of arr) {
        let insert = false;
        if(results.length === 0) {
          results.push(a);
          continue;
        }
        for(let i = 0; i < results.length; i++) {
          const r = results[i];
          if(r.t < a.t) {
            results.splice(i, 0, a);
            insert = true;
            break;
          }
        }
        if(!insert) {
          results.push(a);
        }
      }
    } else if(isFirstPage){ // 文章存在多页，现处于文章的第一页
      for(const a of arr) {
        let insert = false;
        for(let i = 0; i < results.length; i++) {
          const r = results[i];
          if(r.t < a.t) {
            results.splice(i, 0, a);
            insert = true;
            break;
          }
        }
      }
    } else { // 文章存在多页，且现处于中间页，需考虑是否为文章的最后一页
      for(const a of arr) {
        let insert = false;
        for(let i = 0; i < results.length; i++) {
          const r = results[i];
          if(r.t < a.t && a.t <= lastThreadTime) {
            results.splice(i, 0, a);
            insert = true;
            break;
          }
        }
        if(!insert && a.t <= lastThreadTime && isLastPage) {
          results.push(a);
        }
      }
    }


    /*for(const a of arr) {
      let insert = false;
      for(let i = 0; i < results.length; i++) {
        const r = results[i];
        if(r.t < a.t && lastThread && lastThread.tlm <= a.t) {
          results.splice(i, 0, a);
          insert = true;
          break;
        }
      }
      // 若没有插入过数据且是最后一页，则在最末尾插入数据。
      if(!insert && (lastPage || lastThread.tlm <= a.t )) {
        results.push(a);
      }
    }*/

    const t4 = Date.now();
    console.log(`总条数：${results.length}, 最后一页：${isLastPage}`);
    console.log(`精选、最新：${t1-t}ms, 聊天列表：${t2-t1}ms, 专业列表：${t3-t2}ms, 排序：${t4-t3}ms, 总计：${t4 - t}ms`);

    /*results.map(r => {
      console.log(`${require('moment')(r.t).format('YYYY-MM-DD HH:mm:ss')} type: ${r.type}`);
    });*/

    data.results = results;
    ctx.template = 'test/test.pug';
    await next();


  });

module.exports = testRouter;