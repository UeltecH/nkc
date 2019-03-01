const Router = require('koa-router');
const operationRouter = require('./operation');
const threadRouter = new Router();
const homeTopRouter = require('./homeTop');
const toppedRouter = require('./topped');
const closeRouter = require('./close');


threadRouter
	.get('/', async (ctx, next) => {
		const {data, db, query} = ctx;
		const {user} = data;
		const {from, keywords, applicationFormId, self} = query;
		if(from === 'applicationForm') {
			const outPostObj = (post) => {
				return {
					toc: post.toc.toLocaleString(),
					tid: post.tid,
					username: post.user.username,
					uid: post.uid,
					t: post.t,
					pid: post.pid
				}
			};
			const perpage = (page, length) => {
				const perpage = 20;
				const start = perpage*page;
				return {
					page,
					start,
					perpage,
					pageCount: Math.ceil(length/perpage)
				}
			};
			const page = query.page? parseInt(query.page): 0;
			data.paging = {page: 0, pageCount: 1, perpage: 8};
			const threads = [];
			let targetThreads = [];
			if(self === 'true') {
				const length = await db.ThreadModel.count({uid: user.uid, disabled: false});
				const paging= perpage(page, length);
				targetThreads = await db.ThreadModel.find({uid: user.uid, disabled: false}).sort({toc: -1}).skip(paging.start).limit(paging.perpage);
				data.paging = paging;
			} else {
				const applicationForm = await db.FundApplicationFormModel.findOnly({_id: applicationFormId});
				const users = await applicationForm.extendMembers();
				const usersId = users.map(u => u.uid);
				usersId.push(user.uid);
				const post = await db.PostModel.findOne({pid: keywords, uid: {$in: usersId}, disabled: false});
				if(post !== null) {
					await post.extendThread();
					if(post.pid === post.thread.oc) {
						await post.extendUser();
						threads.push(outPostObj(post));
					}
				}
				const targetUser = await db.UserModel.findOne({usernameLowerCase: keywords.toLowerCase()});
				if(targetUser !== null && usersId.includes(targetUser.uid)) {
					const length = await db.ThreadModel.count({uid: targetUser.uid, disabled: false});
					const paging = perpage(page, length);
					targetThreads = await db.ThreadModel.find({uid: targetUser.uid, disabled: false}).sort({toc: -1}).skip(paging.start).limit(paging.perpage);
					data.paging = paging;
				}
			}
			for(let t of targetThreads) {
				const post = await t.extendFirstPost();
				await post.extendUser();
				threads.push(outPostObj(post))
			}
			data.threads = threads;
		}
		await next();
	})
	.get('/:tid', async (ctx, next) => {
		const {data, params, db, query, nkcModules} = ctx;
		const {token} = query;
		let {page = 0, pid, last_page, highlight, step} = query;
		const {tid} = params;
		data.highlight = highlight;
    const thread = await db.ThreadModel.findOnly({tid});
    const forums = await thread.extendForums(['mainForums', 'minorForums']);
		// 验证权限 - new
		// 如果是分享出去的连接，含有token，则允许直接访问
		if(!token){
      await thread.ensurePermission(data.userRoles, data.userGrade, data.user);
		}else{
			let share = await db.ShareModel.findOne({"token":token});
			if(!share) ctx.throw(403, "无效的token");
			// if(share.tokenLife === "invalid") ctx.throw(403, "链接已失效");
			if(share.tokenLife === "invalid"){
				await thread.ensurePermission(data.userRoles, data.userGrade, data.user);
			}
			// 获取分享限制时间
			let allShareLimit = await db.ShareLimitModel.findOne({"shareType":"all"});
			if(!allShareLimit){
				allShareLimit = new db.ShareLimitModel({});
				await allShareLimit.save();
			}
			let shareLimitTime;
      for(const forum of forums) {
        const timeLimit = Number(forum.shareLimitTime);
        if(shareLimitTime === undefined || shareLimitTime > timeLimit) {
          shareLimitTime = timeLimit;
        }
      }
			if(shareLimitTime === undefined) {
        shareLimitTime = allShareLimit.shareLimitTime;
      }
			let shareTimeStamp = parseInt(new Date(share.toc).getTime());
			let nowTimeStamp = parseInt(new Date().getTime());
			if(nowTimeStamp - shareTimeStamp > 1000*60*60*shareLimitTime){
				await db.ShareModel.update({"token": token}, {$set: {tokenLife: "invalid"}});
				await thread.ensurePermission(data.userRoles, data.userGrade, data.user);
			}
			if(share.shareUrl.indexOf(ctx.path) === -1) ctx.throw(403, "无效的token")
    }
    const mainForums = forums.filter(forum => thread.mainForumsId.includes(forum.fid));
    let isModerator = ctx.permission('superModerator');
    if(!isModerator) {
      // 若用户为某个父级专业的专家，则用户具有专家权限
      for(const f of mainForums) {
        isModerator = await f.isModerator(data.user?data.user.uid: '');
        if(isModerator) break;
      }  
    }
		data.isModerator = isModerator;
		// const breadcrumbForums = await forum.getBreadcrumbForums();
		// 判断文章是否被退回或被彻底屏蔽
		if(thread.recycleMark) {
			if(!isModerator) {
				// 访问用户没有查看被退回帖子的权限，若不是自己发表的文章则报权限不足
				if(!data.userOperationsId.includes('displayRecycleMarkThreads')) {
					if(!data.user || thread.uid !== data.user.uid) ctx.throw(403, '权限不足');
				}
			}
			// 取出帖子被退回的原因
			const threadLogOne = await db.DelPostLogModel.findOne({"threadId":tid,"postType":"thread","delType":"toDraft","modifyType":false});
			thread.reason = threadLogOne.reason || '';
		}
		// 构建查询条件
		const match = {
			tid
		};
		const $and = [];
		// 若没有查看被屏蔽的post的权限，判断用户是否为该专业的专家，专家可查看

		// 判断是否为该专业的专家
		// 如果是该专业的专家，加载所有的post；如果不是，则判断有没有相应权限。
		if(!isModerator) {
			if(!data.userOperationsId.includes('displayRecycleMarkThreads')) {
				const $or = [
					{
						disabled: false
					},
					{
						disabled: true,
						toDraft: {$ne: true}
					}
				];
				// 用户能查看自己被退回的回复
				if(data.user) {
					$or.push({
						disabled: true,
						toDraft: true,
						uid: data.user.uid
					});
				}
				$and.push({$or})
			}
			if(!data.userOperationsId.includes('displayDisabledPosts')) {
				const $or = [
					{
						disabled: false
					},
					{
						disabled: true,
						toDraft: {$ne: false}
					}
				];
				$and.push({$or});
			}
			if($and.length !== 0) match.$and = $and;
		}
		// 统计post总数，分页
		const count = await db.PostModel.count(match);
		const paging_ = nkcModules.apiFunction.paging(page, count);
		const {pageCount} = paging_;
		// 删除退休超时的post
		const postAll = await db.PostModel.find({tid:tid,toDraft:true});
		for(let postSin of postAll){
			let onLog = await db.DelPostLogModel.findOne({delType: 'toDraft', postType: 'post', postId: postSin.pid, modifyType: false, toc: {$lt: Date.now()-3*24*60*60*1000}})
			if(onLog){
				await postSin.update({"toDraft":false});
				const tUser = await db.UserModel.findOne({uid: onLog.delUserId});
				data.post = await db.PostModel.findOne({pid: onLog.postId});
				if(tUser && data.post) {
          await db.KcbsRecordModel.insertSystemRecord('postBlocked', tUser, ctx);
        }
			}
		}
		await db.DelPostLogModel.updateMany({delType: 'toDraft', postType: 'post', threadId: tid, modifyType: false, toc: {$lt: Date.now()-3*24*60*60*1000}}, {$set: {delType: 'toRecycle'}});
		if(pid && step === undefined) {
			const disabled = data.userOperationsId.includes('displayDisabledPosts');
			const {page, step} = await thread.getStep({pid, disabled});
			ctx.status = 303;
			return ctx.redirect(`/t/${tid}?&page=${page}&highlight=${pid}#${pid}`);
		}
		if(last_page) {
			page = pageCount -1;
		}
		// 查询该文章下的所有post
		const paging = nkcModules.apiFunction.paging(page, count);
		data.paging = paging;
		const posts = await db.PostModel.find(match).sort({toc: 1}).skip(paging.start).limit(paging.perpage);

    data.posts = await db.PostModel.extendPosts(posts, {uid: data.user?data.user.uid: ''});
		// 添加给被退回的post加上标记
		const toDraftPosts = await db.DelPostLogModel.find({modifyType: false, postType: 'post', delType: 'toDraft', threadId: tid});
		const toDraftPostsId = toDraftPosts.map(post => post.postId);
		data.posts.map(async post => {
			const index = toDraftPostsId.indexOf(post.pid);
			if(index !== -1) {
				post.todraft = true;
				post.reason = toDraftPosts[index].reason;
			}
		});
		// data.posts = posts;
		// console.log(data.posts)
		// 加载文章所在专业位置，移动文章的选择框
		data.forumList = await db.ForumModel.visibleForums(data.userRoles, data.userGrade, data.user);
		// data.parentForums = await forum.extendParentForum();
		data.forumsThreadTypes = await db.ThreadTypeModel.find().sort({order: 1});
		// data.selectedArr = breadcrumbForums.map(f => f.fid);
		// data.selectedArr.push(forum.fid);
		data.cat = thread.cid;
		// 若不是游客访问，加载用户的最新发表的文章
		if(data.user) {
			data.usersThreads = await data.user.getUsersThreads();
		}
		// data.ads = (await db.SettingModel.findOnly({type: 'system'})).ads;
		// 判断是否显示在专栏加精、置顶...按钮
		const {mid, toMid} = thread;
		let myForum, othersForum;
		if(mid !== '') {
			myForum = await db.PersonalForumModel.findOne({uid: mid});
			data.myForum = myForum
		}

		if(toMid !== '') {
			othersForum = await db.PersonalForumModel.findOne({uid: toMid});
			data.othersForum = othersForum
		}
    data.targetUser = await thread.extendUser();
    await db.UserModel.extendUsersInfo([data.targetUser]);
		// 文章访问量加1
		await thread.update({$inc: {hits: 1}});
		data.thread = thread;
		data.forums = forums;
		data.replyTarget = `t/${tid}`;
		const homeSettings = await db.SettingModel.findOnly({_id: 'home'});
		data.ads = homeSettings.c.ads;
		ctx.template = 'thread/index.pug';
		await thread.extendFirstPost().then(async p => {
			await p.extendUser().then(u => u.extendGrade());
			await p.extendResources();
    });
    await db.UserModel.extendUsersInfo([data.thread.firstPost.user]);
		await thread.extendLastPost();
		if(data.user) {
      const vote = await db.PostsVoteModel.findOne({uid: data.user.uid, pid: thread.oc});
      thread.firstPost.usersVote = vote?vote.type: '';
      data.kcbSettings = (await db.SettingModel.findOnly({_id: 'kcb'})).c;
      data.xsfSettings = (await db.SettingModel.findOnly({_id: 'xsf'})).c;
      data.redEnvelopeSettings = (await db.SettingModel.findOnly({_id: 'redEnvelope'})).c;
    }
		// 加载收藏
		data.collected = false;
		if(data.user) {
			const collection = await db.CollectionModel.findOne({uid: data.user.uid, tid});
			if(collection) {
				data.collected = true;
			}
		}

		data.homeSettings = (await db.SettingModel.findOnly({_id: 'home'})).c;

		if(data.user) {
			data.subscribe = await db.UsersSubscribeModel.findOnly({uid: data.user.uid});
		}

		// 加载用户的帖子
		const fidOfCanGetThreads = await db.ForumModel.getThreadForumsId(data.userRoles, data.userGrade, data.user);
		const q = {
			uid: data.targetUser.uid,
			mainForumsId: {$in: fidOfCanGetThreads},
			recycleMark: {$ne: true}
		};
		const targetUserThreads = await db.ThreadModel.find(q).sort({toc: -1}).limit(10);
		data.targetUserThreads = await db.ThreadModel.extendThreads(targetUserThreads, {
		  forum: false,
      firstPostUser: false,
      lastPost: false
    });


		// 相似文章
    data.sameThreads = [];
    let fids = thread.mainForumsId.concat(thread.minorForumsId);
    fids = fids.filter(id => fidOfCanGetThreads.includes(id));
    if(fids.length !== 0) {
      const sameThreads = await db.ThreadModel.aggregate([
				{
					$match: {
						mainForumsId: fids,
						digest: true,
						recycleMark: {$ne: true}
					}
				},
				{
					$sample: {
						size: 10
					}
				}
			]);
			data.sameThreads = await db.ThreadModel.extendThreads(sameThreads, {
			  lastPost: false,
        forum: false,
        firstPostUser: false
      });
    }

		// 关注的用户
		if(data.user) {
			data.userSubscribe = await db.UsersSubscribeModel.findOnly({uid: data.user.uid});
			if(!data.user.volumeA) {
				// 加载考试设置
				// data.examSettings = (await db.SettingModel.findOnly({_id: 'exam'})).c;
				data.postSettings = (await db.SettingModel.findOnly({_id: 'post'})).c;
				const today = nkcModules.apiFunction.today();
        const todayThreadCount = await db.ThreadModel.count({toc: {$gt: today}, uid: data.user.uid});
        let todayPostCount = await db.PostModel.count({toc: {$gt: today}, uid: data.user.uid});
        data.userPostCountToday = todayPostCount - todayThreadCount;
			}
		}
		data.targetUserSubscribe = await db.UsersSubscribeModel.findOnly({uid: data.targetUser.uid});
		data.thread = data.thread.toObject();
		data.pid = pid;
		data.step = step;
		await next();
	})
	.post('/:tid', async (ctx, next) => {
		const {
			data, nkcModules, params, db, body, address: ip
		} = ctx;
		const {user} = data;
    // 根据发表设置，判断用户是否有权限发表文章
    // 1. 身份认证等级
    // 2. 考试
    // 3. 角色
    // 4. 等级
    const postSettings = await db.SettingModel.findOnly({_id: 'post'});
    const {authLevelMin, exam} = postSettings.c.postToThread;
    const {volumeA, volumeB, notPass} = exam;
    const {status, countLimit, unlimited} = notPass;
    const today = nkcModules.apiFunction.today();
    const todayThreadCount = await db.ThreadModel.count({toc: {$gt: today}, uid: user.uid});
    let todayPostCount = await db.PostModel.count({toc: {$gt: today}, uid: user.uid});
    todayPostCount = todayPostCount - todayThreadCount;
    if(authLevelMin > user.authLevel) ctx.throw(403,`身份认证等级未达要求，发表回复至少需要完成身份认证 ${authLevelMin}`);
    if((!volumeB || !user.volumeB) && (!volumeA || !user.volumeA)) { // a, b考试未开启或用户未通过
      if(!status) ctx.throw(403, '权限不足，请提升账号等级');
      if(!unlimited && countLimit <= todayPostCount) ctx.throw(403, '今日发表回复次数已用完，请明天再试。');
    }

    // 发表回复时间、条数限制
    const {postToThreadCountLimit, postToThreadTimeLimit} = await user.getPostLimit();
    if(todayPostCount >= postToThreadCountLimit) ctx.throw(400, `您当前的账号等级每天最多只能发表${postToThreadCountLimit}条回复，请明天再试。`);
    const latestThread = await db.ThreadModel.findOne({uid: user.uid}).sort({toc: -1});
    const q = {
      uid: user.uid,
      toc: {$gt: (Date.now() - postToThreadTimeLimit * 60 * 1000)}
    };
    if(latestThread) {
      q.tid = {$ne: latestThread.tid}
    }
    const latestPost = await db.PostModel.findOne(q);
    if(latestPost) ctx.throw(400, `您当前的账号等级限定发表回复间隔时间不能小于${postToThreadTimeLimit}分钟，请稍后再试。`);


		/*const userPersonal = await db.UsersPersonalModel.findOnly({uid: user.uid});
		// 获取认证等级
		const authLevel = await userPersonal.getAuthLevel();
		if(authLevel < 1) ctx.throw(403,'您的账号还未实名认证，请前往资料设置处绑定手机号码。');
		if(!user.username) ctx.throw(403, '您的账号还未完善资料，请前往资料设置页完善必要资料。');
		// if(!user.volumeA) ctx.throw(403, '您还未通过A卷考试，未通过A卷考试不能发表回复。');*/
		const {tid} = params;
		const thread = await db.ThreadModel.findOnly({tid});
		if(thread.closed) ctx.throw(400, '主题已关闭，暂不能发表回复');

		/*if(!user.volumeA) {
			// -1: 无限制；0：不允许；正整数：相应条数
			const examSettings = await db.SettingModel.findOnly({_id: 'exam'});
			const postCountOneDay = examSettings.c.volumeAFailedPostCountOneDay;
			if(postCountOneDay !== -1) {
				if(postCountOneDay === 0) {
					ctx.throw(403, '未通过A卷考试的用户暂不能发表回复');
				} else {
					const today = nkcModules.apiFunction.today();
					const postCountToday = await db.InfoBehaviorModel.count({uid: user.uid, toc: {$gte: today}, operationId: 'postToThread'});
					if(postCountToday >= postCountOneDay) ctx.throw(403, `未通过A卷考试的用户每天仅能发表${postCountOneDay}条回复`);
				}
			}
		}*/

		/*// 发表回复时间、条数限制
		const {postToThreadCountLimit, postToThreadTimeLimit} = await user.getPostLimit();
		const today = nkcModules.apiFunction.today();
		const postToThreadCount = await db.InfoBehaviorModel.count({toc: {$gt: today}, uid: user.uid, operationId: 'postToThread'});
		if(postToThreadCount >= postToThreadCountLimit) ctx.throw(400, `您当前的账号等级每天最多只能发表${postToThreadCountLimit}条回复，请明天再试。`);
		const latestPostLog = await db.InfoBehaviorModel.findOne({uid: user.uid, operationId: 'postToThread', toc: {$gt: (Date.now() - postToThreadTimeLimit * 60 * 1000)}});
		if(latestPostLog) ctx.throw(400, `您当前的账号等级限定发表回复间隔时间不能小于${postToThreadTimeLimit}分钟，请稍后再试。`);*/


		data.thread = thread;
		await thread.extendForums(['mainForums', 'minorForums']);
		data.forum = thread.forum;
		// 权限判断
		await thread.ensurePermission(data.userRoles, data.userGrade, data.user);
		const {post} = body;
		if(post.c.length < 6) ctx.throw(400, '内容太短，至少6个字节');
		const _post = await thread.newPost(post, user, ip);
    data.post = _post;
		data.targetUser = await thread.extendUser();

		// 生成记录
		const obj = {
			user,
			type: 'score',
			key: 'postCount',
			typeIdOfScoreChange: 'postToThread',
			tid: post.tid,
			pid: post.pid,
			ip: ctx.address,
			port: ctx.port
		};
		await db.UsersScoreLogModel.insertLog(obj);
		obj.type = 'kcb';
		await db.KcbsRecordModel.insertSystemRecord('postToThread', user, ctx);
		// await db.UsersScoreLogModel.insertLog(obj);

		if(thread.uid !== user.uid) {
      const messageId = await db.SettingModel.operateSystemID('messages', 1);
      const message = db.MessageModel({
        _id: messageId,
        r: thread.uid,
        ty: 'STU',
        c: {
          type: 'replyThread',
          targetPid: _post.pid,
          pid: thread.oc
        }
      });
      await message.save();

      await ctx.redis.pubMessage(message);
		}
		await thread.update({$inc: [{count: 1}, {hits: 1}]});
		const type = ctx.request.accepts('json', 'html');
		await thread.updateThreadMessage();
		if(type === 'html') {
			ctx.status = 303;
			return ctx.redirect(`/t/${tid}`)
		}
		data.redirect = `/t/${thread.tid}?&pid=${_post.pid}`;
		//帖子曾经在草稿箱中，发表时，删除草稿
		await db.DraftModel.remove({"desType":post.desType,"desTypeId":post.desTypeId});
    global.NKC.io.of('/thread').NKC.postToThread(data.post);
		await next();
  })
	//.use('/:tid/digest', digestRouter.routes(), digestRouter.allowedMethods())
	.use('/:tid/hometop', homeTopRouter.routes(), homeTopRouter.allowedMethods())
	.use('/:tid/topped', toppedRouter.routes(), toppedRouter.allowedMethods())
	.use('/:tid/close', closeRouter.routes(), closeRouter.allowedMethods())
	.use('/:tid', operationRouter.routes(), operationRouter.allowedMethods());
module.exports = threadRouter;