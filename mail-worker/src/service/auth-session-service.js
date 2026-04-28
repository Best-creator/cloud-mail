import KvConst from '../const/kv-const';

const authSessionService = {

	async selectByUserId(c, userId) {
		const row = await c.env.db.prepare(`
			SELECT user_id, tokens, user_json, refresh_time
			FROM auth_session
			WHERE user_id = ?
		`).bind(userId).first();

		if (row) {
			return this.formatRow(row);
		}

		const authInfo = await c.env.kv.get(KvConst.AUTH_INFO + userId, { type: 'json' });

		if (!authInfo) {
			return null;
		}

		await this.save(c, authInfo);
		return authInfo;
	},

	formatRow(row) {
		return {
			user: JSON.parse(row.user_json),
			tokens: JSON.parse(row.tokens || '[]'),
			refreshTime: row.refresh_time
		};
	},

	async save(c, authInfo) {
		if (!authInfo?.user?.userId) {
			return;
		}

		await c.env.db.prepare(`
			INSERT INTO auth_session (user_id, tokens, user_json, refresh_time)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(user_id) DO UPDATE SET
				tokens = excluded.tokens,
				user_json = excluded.user_json,
				refresh_time = excluded.refresh_time,
				update_time = CURRENT_TIMESTAMP
		`).bind(
			authInfo.user.userId,
			JSON.stringify(Array.isArray(authInfo.tokens) ? authInfo.tokens : []),
			JSON.stringify(authInfo.user),
			authInfo.refreshTime || new Date().toISOString()
		).run();
	},

	async delete(c, userId) {
		await Promise.all([
			c.env.db.prepare(`DELETE FROM auth_session WHERE user_id = ?`).bind(userId).run(),
			c.env.kv.delete(KvConst.AUTH_INFO + userId)
		]);
	},

	async deleteByUserIds(c, userIds) {
		if (!userIds?.length) {
			return;
		}

		const placeholders = userIds.map(() => '?').join(',');
		await Promise.all([
			c.env.db.prepare(`DELETE FROM auth_session WHERE user_id IN (${placeholders})`).bind(...userIds).run(),
			...userIds.map(userId => c.env.kv.delete(KvConst.AUTH_INFO + userId))
		]);
	},

	async removeToken(c, userId, token) {
		const authInfo = await this.selectByUserId(c, userId);

		if (!authInfo) {
			return null;
		}

		const index = authInfo.tokens.findIndex(item => item === token);

		if (index === -1) {
			return authInfo;
		}

		authInfo.tokens.splice(index, 1);

		if (authInfo.tokens.length === 0) {
			await this.delete(c, userId);
			return authInfo;
		}

		await this.save(c, authInfo);
		return authInfo;
	}
};

export default authSessionService;
