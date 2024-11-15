const express = require('express');
const { Pool } = require('pg');
const amqp = require('amqplib');
const { productSchema, shopSchema, stockSchema, stockIncreaseOrDecreaseSchema } = require('./validation');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
});

const app = express();
app.use(express.json());

let channel, connection;

async function initializeTables() {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS shops (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          plu VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          shop_id INT REFERENCES shops(id) NOT NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
  
      await pool.query(`
        CREATE TABLE IF NOT EXISTS stock (
          id SERIAL PRIMARY KEY,
          product_id INT REFERENCES products(id) NOT NULL,
          shop_id INT REFERENCES shops(id) NOT NULL,
          quantity_on_shelf INT NOT NULL,
          quantity_in_order INT NOT NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
          CREATE TABLE IF NOT EXISTS log (
          id SERIAL PRIMARY KEY,
          product_id INT REFERENCES products(id) NOT NULL,
          shop_id INT REFERENCES shops(id) NOT NULL,
          action VARCHAR(255) NOT NULL,
          "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`)
  
      console.log('Таблицы успешно созданы или уже существуют.');
    } catch (error) {
      console.error('Ошибка при инициализации таблиц:', error);
      process.exit(1);
    }
  }

async function connectRabbitMQ() {
    try {
      connection = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}:${process.env.RABBITMQ_PORT}`);
      channel = await connection.createChannel();
      await channel.assertQueue('add_product');
      await channel.assertQueue('add_store');
      await channel.assertQueue('increase_store');
      await channel.assertQueue('decrease_store');
      console.log('Connected to RabbitMQ');
    } catch (error) {
      console.error('Ошибка подключения к RabbitMQ:', error);
    }
  }


async function start(){
    await initializeTables()
    await connectRabbitMQ()
        
    app.post('/shop', async (req, res)=>{
        try{
            const { error } = shopSchema.validate(req.body);

            if (error) {
              return res.status(400).json({ error: error.details[0].message });
            }

            const { name } = req.body;

            const result = await pool.query(
                'INSERT INTO shops (name) VALUES ($1) RETURNING *',
                [name]
            );

           return res.status(201).json(result.rows[0]);
        } catch(error){
          return res.status(400).json({ error: error.message });
        }
    })

    app.post('/product', async (req, res) => {
          try {
            const { error } = productSchema.validate(req.body);
            if (error) {
              return res.status(400).json({ error: error.details[0].message });
            }

            const { plu, name, shop_id } = req.body;

            const isShop = await pool.query(`SELECT FROM shops WHERE id = ${shop_id}`)

            if(!isShop.rows.length){
              return res.status(404).json({ error: 'Shop not found' });
            }

            const result = await pool.query(
              'INSERT INTO products (plu, name, shop_id) VALUES ($1, $2, $3) RETURNING *',
              [plu, name, shop_id]
            );

            await channel.sendToQueue('add_product', Buffer.from(JSON.stringify(result.rows[0])));

            return res.status(201).json(result.rows[0]);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
        app.post('/stock', async (req, res) => {
          try {
            const { error } = stockSchema.validate(req.body);
            if (error) {
              return res.status(400).json({ error: error.details[0].message });
            }

            const { product_id, shop_id, quantity_on_shelf, quantity_in_order } = req.body;

            const isShop = await pool.query(`SELECT FROM shops WHERE id = ${shop_id}`)

            if(!isShop.rows.length){
              return res.status(404).json({ error: 'Shop not found' });
            }

            const isProduct = await pool.query(`SELECT FROM products WHERE id = ${product_id}`)

            if(!isProduct.rows.length){
              return res.status(404).json({ error: 'Product not found' });
            }

            const result = await pool.query(
              `INSERT INTO stock (product_id, shop_id, quantity_on_shelf, quantity_in_order)
               VALUES ($1, $2, $3, $4) RETURNING *`,
              [product_id, shop_id, quantity_on_shelf, quantity_in_order]
            );

            await channel.sendToQueue('add_stock', Buffer.from(JSON.stringify(result.rows[0])));

            return res.status(201).json(result.rows[0]);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
        app.patch('/stocks/increase/shelf', async (req, res) => {
          try {
            const { error } = stockIncreaseOrDecreaseSchema.validate(req.body);
            if (error) {
              return res.status(400).json({ error: error.details[0].message });
            }

            const { id, amount } = req.body;

            const result = await pool.query(
              `UPDATE stock
               SET quantity_on_shelf = quantity_on_shelf + $1
               WHERE id = $2 RETURNING *`,
              [amount, id]
            );

            if(!result.rows.length){
              return res.status(200).json({})
            }

            await channel.sendToQueue('add_stock_increase_shelf', Buffer.from(JSON.stringify(result.rows[0])));

            return res.status(200).json(result.rows[0]);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
        app.patch('/stocks/decrease/shelf', async (req, res) => {
          try {
            const { error } = stockIncreaseOrDecreaseSchema.validate(req.body);
            if (error) {
              return res.status(400).json({ error: error.details[0].message });
            }

            const { id, amount } = req.body;

            const existedStore = await pool.query(`SELECT amount FROM store WHERE id = ${id}`);

            if(existedStore.rows.length && existedStore.rows[0].amount < amount){
              return res.status(404).json({error:'Amount more than we have'})
            }

            const result = await pool.query(
              `UPDATE stock
               SET quantity_on_shelf = quantity_on_shelf - $1
               WHERE id = $2 RETURNING *`,
              [amount, id,]
            );

            if(!result.rows.length){
              return res.status(200).json({})
            }

            await channel.sendToQueue('add_stock_decrease_shelf', Buffer.from(JSON.stringify(result.rows[0])));

            return res.status(200).json(result.rows[0]);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
        app.get('/stocks', async (req, res) => {
          const { product_id, shop_id, min_shelf, max_shelf, min_order, max_order } = req.query;
          try {
            if(min_order && !max_order || !min_order && max_order){
              return res.status(404).json({error:'Missing'});
            }

            if(min_shelf && !max_shelf || !min_shelf && max_shelf){
              return res.status(404).json({error:'Missing'});
            }

            let query = `SELECT * FROM stock WHERE 1=1`;
            
            const params = [];
            
            if (product_id) {
              query += ` AND product_id = $${params.length + 1}`;
              params.push(product_id);
            }
            if (shop_id) {
              query += ` AND shop_id = $${params.length + 1}`;
              params.push(shop_id);
            }
            if (min_shelf && max_shelf) {
              query += ` AND quantity_on_shelf >= $${params.length + 1} AND quantity_on_shelf <= $${params.length + 2}`;
              params.push(min_shelf);
              params.push(max_shelf);
            }

            if (min_order && max_order) {
              query += ` AND quantity_in_order >= $${params.length + 1} AND quantity_in_order <= $${params.length + 2}`;
              params.push(min_order);
              params.push(max_order);
            }
        
            const result = await pool.query(query, params);

            return res.status(200).json(result.rows);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
        app.get('/products', async (req, res) => {
          const { name, plu } = req.query;
          try {
            let query = `SELECT * FROM products WHERE 1=1`;
            const params = [];
        
            if (name) {
              query += ` AND name = $${params.length + 1}`;
              params.push(`${name}`);
            }
            if (plu) {
              query += ` AND plu = $${params.length + 1}`;
              params.push(plu);
            }
        
            const result = await pool.query(query, params);
            return res.status(200).json(result.rows);
          } catch (error) {
            return res.status(400).json({ error: error.message });
          }
        });
        
    app.listen(3000, () => {
          console.log('3000');
    });
}

start()
