yarn build
aws s3 rm s3://raurir.com/apps/audio-dub-generator/ --recursive
aws s3 sync ./dist s3://raurir.com/apps/audio-dub-generator/
aws cloudfront create-invalidation --distribution-id E34F50VVZYJIRI --paths '/apps/audio-dub-generator/*'