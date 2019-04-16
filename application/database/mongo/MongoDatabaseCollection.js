module.exports = class MongoDatabaseCollection {

    constructor(mongoCollection) {
        this.collection = mongoCollection;
    }

    createIndex(keys, options) {
        this.collection.createIndex(keys, options);
    }

    createDocument(document, callback) {
        this.collection.insertOne(document, callback);
    }

    findDocuments(query, projection) {
        return this.collection.find(query, projection);
    }

    findDocument(query, projection, callback) {
        return this.collection.findOne(query, projection, callback);
    }

    updateDocuments(query, update, callback) {
        this.collection.updateMany(query, update, callback);
    }

    updateDocument(query, update, callback) {
        this.collection.updateOne(query, update, callback);
    }

    deleteDocument() {

    }

    distinct(field, callback) {
        this.collection.distinct(field, {cursor : {}}, callback);
    }

    countDocuments(query, callback) {
        this.collection.countDocuments(query, callback);
    }

    aggregate(pipeline, callback) {
        this.collection.aggregate(pipeline, callback);
    }
}
