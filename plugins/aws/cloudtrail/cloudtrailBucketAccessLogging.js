var async = require('async');
var helpers = require('../../../helpers/aws');

module.exports = {
    title: 'CloudTrail Bucket Access Logging',
    category: 'S3',
    domain: 'Compliance',
    description: 'Ensures CloudTrail logging bucket has access logging enabled to detect tampering of log files',
    more_info: 'CloudTrail buckets should utilize access logging for an additional layer of auditing. If the log files are deleted or modified in any way, the additional access logs can help determine who made the changes.',
    recommended_action: 'Enable access logging on the CloudTrail bucket from the S3 console',
    link: 'http://docs.aws.amazon.com/AmazonS3/latest/UG/ManagingBucketLogging.html',
    apis: ['CloudTrail:describeTrails', 'S3:getBucketLogging', 'S3:listBuckets'],
    compliance: {
        hipaa: 'Access logging for CloudTrail helps ensure strict integrity controls, ' +
                'verifying that the audit logs for the AWS environment are not modified.',
        pci: 'PCI requires tracking and monitoring of all access to environments ' +
             'in which cardholder data is present. CloudTrail bucket access logging ' +
             'helps audit the bucket in which these logs are stored.',
        cis1: '2.6 Ensure CloudTrail bucket access logging is enabled'
    },
    settings: {
        whitelist_ct_bucket_access_loggings: {
            name: 'Whitelist Cloud Trail Bucket Access Loggings',
            description: 'All buckets with this regex should get whitelisted',
            regex: '^.*$',
            default: '',
        }
    },

    run: function(cache, settings, callback) {
        var config = {
            whitelist_ct_bucket_access_loggings: settings.whitelist_ct_bucket_access_loggings ||  this.settings.whitelist_ct_bucket_access_loggings.default
        };
        var regBucket;
        if (config.whitelist_ct_bucket_access_loggings.length) regBucket= new RegExp(config.whitelist_ct_bucket_access_loggings); 
        var results = [];
        var source = {};
        var regions = helpers.regions(settings);
        var defaultRegion = helpers.defaultRegion(settings);

        var listBuckets = helpers.addSource(cache, source,
            ['s3', 'listBuckets', defaultRegion]);

        if (!listBuckets || listBuckets.err || !listBuckets.data) {
            helpers.addResult(results, 3,
                'Unable to query for S3 buckets: ' + helpers.addError(listBuckets));
            return callback(null, results, source);
        }

        async.each(regions.cloudtrail, function(region, rcb){

            var describeTrails = helpers.addSource(cache, source,
                ['cloudtrail', 'describeTrails', region]);

            if (!describeTrails) return rcb();

            if (describeTrails.err || !describeTrails.data) {
                helpers.addResult(results, 3,
                    'Unable to query for CloudTrail policy: ' + helpers.addError(describeTrails), region);
                return rcb();
            }

            if (!describeTrails.data.length) {
                helpers.addResult(results, 0, 'No S3 buckets to check', region);
                return rcb();
            }

            async.each(describeTrails.data, function(trail, cb){
                if (!trail.S3BucketName || (trail.HomeRegion && trail.HomeRegion.toLowerCase() !== region)) return cb();
                // Skip CloudSploit-managed events bucket
                if (trail.S3BucketName == helpers.CLOUDSPLOIT_EVENTS_BUCKET) return cb();

                if (regBucket && regBucket.test(trail.S3BucketName)) {
                    helpers.addResult(results, 0, 
                        'Bucket has been whitelisted', region, 'arn:aws:s3:::'+trail.S3BucketName);
                    return cb();
                }

                if (!listBuckets.data.find(bucket => bucket.Name == trail.S3BucketName)) {
                    helpers.addResult(results, 2,
                        'Unable to locate S3 bucket, it may have been deleted',
                        region, 'arn:aws:s3:::' + trail.S3BucketName);
                    return cb(); 
                }

                var s3Region = helpers.defaultRegion(settings);

                var getBucketLogging = helpers.addSource(cache, source,
                    ['s3', 'getBucketLogging', s3Region, trail.S3BucketName]);

                if (!getBucketLogging || getBucketLogging.err || !getBucketLogging.data) {
                    helpers.addResult(results, 3,
                        'Error querying for bucket policy for bucket: ' + trail.S3BucketName + ': ' + helpers.addError(getBucketLogging),
                        region, 'arn:aws:s3:::' + trail.S3BucketName);

                    return cb();
                }

                if (getBucketLogging &&
                    getBucketLogging.data &&
                    getBucketLogging.data.LoggingEnabled) {
                    helpers.addResult(results, 0,
                        'Bucket: ' + trail.S3BucketName + ' has S3 access logs enabled',
                        region, 'arn:aws:s3:::' + trail.S3BucketName);
                } else {
                    helpers.addResult(results, 1,
                        'Bucket: ' + trail.S3BucketName + ' has S3 access logs disabled',
                        region, 'arn:aws:s3:::' + trail.S3BucketName);
                }

                cb();
            }, function(){
                rcb();
            });
        }, function(){
            callback(null, results, source);
        });
    }
};