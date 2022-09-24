var helpers = require('../../../helpers/aws');

module.exports = {
    title: 'S3 Bucket Has Tags',
    category: 'S3',
    domain: 'Storage',
    description: 'Ensure S3 Buckets have tags',
    more_info: 'Tags help you to group resources together that are related to or associated with each other. It is a best practice to tag cloud resources to better organize and gain visibility into their usage.',
    recommended_action: 'Add tags to S3 bucket',
    link: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/CostAllocTagging.html',
    apis: ['S3:listBuckets', 'ResourceGroupsTaggingAPI:getResources'],

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};

        var region = helpers.defaultRegion(settings);
        var listBuckets = helpers.addSource(cache, source,
            ['s3', 'listBuckets', region]);

        if (!listBuckets) return callback(null, results, source);

        if (listBuckets.err || !listBuckets.data) {
            helpers.addResult(results, 3,
                'Unable to query for S3 buckets: ' + helpers.addError(listBuckets));
            return callback(null, results, source);
        }

        if (!listBuckets.data.length) {
            helpers.addResult(results, 0, 'No S3 buckets to check');
            return callback(null, results, source);
        }

        const arnList = []
        for(bucket of listBuckets.data) {
            const arn = `arn:aws:s3:::${bucket.Name}`
            arnList.push(arn)
        }
        helpers.checkTags(cache, 's3',arnList, region, results)
        callback(null, results, source);
    }
};