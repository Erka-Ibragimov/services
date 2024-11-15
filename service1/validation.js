const Joi = require('joi');

const productSchema = Joi.object({
    name: Joi.string().max(255).required(),
    plu: Joi.string().max(255).required(),
    shop_id: Joi.number().required()
});

const shopSchema = Joi.object({
    name: Joi.string().max(255).required(),
})

const stockSchema = Joi.object({
    product_id: Joi.number().required(),
    shop_id: Joi.number().required(),
    quantity_on_shelf: Joi.number().required(),
    quantity_in_order: Joi.number().required()
})

const stockIncreaseOrDecreaseSchema = Joi.object({
    id: Joi.number().required(),
    amount: Joi.number().required(),
})

module.exports = {
    productSchema,
    shopSchema,
    stockSchema,
    stockIncreaseOrDecreaseSchema
};