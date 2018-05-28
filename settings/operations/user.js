module.exports = {
	PARAMETER: {
		GET: 'visitUserCard',
		banned: {
			PATCH: 'bannedUser'
		},
		settings: {
			GET: 'visitUserAvatarSettings',
			avatar: {
				GET: 'visitUserAvatarSettings',
			},
			info: {
				GET: 'visitUserInfoSettings',
				PATCH: 'modifyUserInfo'
			},
			resume: {
				GET: 'visitUserResumeSettings',
				PATCH: 'modifyUserResume'
			},
			transaction: {
				GET: 'visitUserTransactionSettings',
				PATCH: 'modifyUserTransaction'
			},
			social: {
				GET: 'visitUserSocialSettings',
				PATCH: 'modifyUserSocial'
			},
			photo: {
				GET: 'visitUserPhotoSettings',
				PATCH: 'modifyUserPhotoSettings'
			},
			cert: {
				GET: 'visitUserCertPhotoSettings',
				PATCH: 'modifyUserCertPhotoSettings'
			},
			password: {
				GET: 'visitPasswordSettings',
				PATCH: 'modifyPassword'
			},
			mobile: {
				GET: 'visitMobileSettings',
				PATCH: 'modifyMobile',
				POST: 'bindMobile'
			},
			email: {
				GET: 'visitEmailSettings',
				POST: 'bindEmail'
			},
			verify: {
				PARAMETER: {
					GET: 'visitVerifySettings',
				}
			}
		},
		auth: {
			GET: 'visitUserAuth',
			DELETE: 'cancelSubmitVerify',
			PARAMETER: {
				POST: 'submitVerify',
				PATCH: 'modifyUserVerifyStatus'
			}
		},
		collections: {
			PARAMETER: {
				GET: 'visitCollections',
				PATCH: 'modifyCollectionsCategory',
				DELETE: 'deleteCollection'
			}
		},
		drafts: {
			GET: 'visitDraftList',
			POST: 'addDraft',
			PARAMETER: {
				DELETE: 'deleteDraft'
			}
		},
		subscribe: {
			register: {
				GET: 'visitSubscribeForums',
				POST: 'submitSubscribeForums'
			}
		}
	}
};