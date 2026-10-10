from decorators.login_required import requires_scopes
from flask import Flask, jsonify, request, Blueprint
from runtime import S3PresignedURLHandler
from scopes import DOCTOR_RECORDS_READ, DOCTOR_RECORDS_WRITE

s3_blueprint = Blueprint("s3", __name__)

@s3_blueprint.route('/generate-upload-url/<object_name>', methods=['GET'])
@requires_scopes(DOCTOR_RECORDS_WRITE)
def generate_upload_url(object_name):

    if not object_name:
        return jsonify({"error": "Missing object_name"}), 400
    
    url_response = S3PresignedURLHandler.generate_upload_url(object_name)

    return jsonify(url_response)

@s3_blueprint.route('/generate-download-url/<object_name>', methods=['GET'])
@requires_scopes(DOCTOR_RECORDS_READ)
def generate_download_url(object_name):

    if not object_name:
        return jsonify({"error": "Missing object_name"}), 400
    
    url_response = S3PresignedURLHandler.generate_download_url(object_name)
    return jsonify(url_response)

if __name__ == '__main__':
    s3_blueprint.run(debug=True)