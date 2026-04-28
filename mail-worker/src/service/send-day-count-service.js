import kvConst from '../const/kv-const';
import dayjs from 'dayjs';

const sendDayCountService = {

	async increase(c, quantity, dateStr = dayjs().format('YYYY-MM-DD')) {
		const total = Number(quantity) || 0;

		if (total <= 0) {
			return;
		}

		await c.env.db.prepare(`
			INSERT INTO send_day_count (day, total)
			VALUES (?, ?)
			ON CONFLICT(day) DO UPDATE SET
				total = total + excluded.total,
				update_time = CURRENT_TIMESTAMP
		`).bind(dateStr, total).run();
	},

	async get(c, dateStr = dayjs().format('YYYY-MM-DD')) {
		const row = await c.env.db.prepare(`
			SELECT total
			FROM send_day_count
			WHERE day = ?
		`).bind(dateStr).first();

		if (row) {
			return Number(row.total) || 0;
		}

		const daySendTotal = await c.env.kv.get(kvConst.SEND_DAY_COUNT + dateStr);

		if (daySendTotal == null) {
			return 0;
		}

		const total = Number(daySendTotal) || 0;
		await c.env.db.prepare(`
			INSERT INTO send_day_count (day, total)
			VALUES (?, ?)
			ON CONFLICT(day) DO UPDATE SET
				total = excluded.total,
				update_time = CURRENT_TIMESTAMP
		`).bind(dateStr, total).run();

		return total;
	}
};

export default sendDayCountService;
