const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from settings where id = 1`);
  res.json(rows[0]);
});

router.put('/', async (req, res) => {
  const { company_name, city, founder, currency, utilization } = req.body || {};
  const { rows } = await db.query(
    `update settings set
       company_name = coalesce($1, company_name),
       city = coalesce($2, city),
       founder = coalesce($3, founder),
       currency = coalesce($4, currency),
       utilization = coalesce($5, utilization)
     where id = 1 returning *`,
    [company_name, city, founder, currency, utilization]
  );
  res.json(rows[0]);
});

module.exports = router;
