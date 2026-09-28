import json
import logging
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from flask import Flask, Response, request

app = Flask(__name__)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AWS_REGION = os.environ.get("AWS_REGION", "ca-central-1")
TABLE_NAME = os.environ["TABLE_NAME"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "http://localhost:8080")

dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(TABLE_NAME)


def decimal_serializer(value):
    """Convert DynamoDB Decimal values into JSON-compatible numbers."""
    if isinstance(value, Decimal):
        if value % 1 == 0:
            return int(value)
        return float(value)
    raise TypeError(f"Cannot serialize {type(value)}")


def api_response(body, status_code=200):
    return Response(
        response=json.dumps(body, default=decimal_serializer),
        status=status_code,
        mimetype="application/json",
    )


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.get("/health")
def health():
    return api_response({"status": "healthy"})


@app.route("/api/applications", methods=["GET", "POST", "OPTIONS"])
def applications():
    if request.method == "OPTIONS":
        return api_response({}, 204)

    if request.method == "POST":
        try:
            body = request.get_data(as_text=True) or "{}"
            data = json.loads(body, parse_float=Decimal)

            if not isinstance(data, dict) or not data:
                return api_response({"message": "A JSON request body is required"}, 400)

            now = datetime.now(timezone.utc).isoformat()
            item = data.copy()
            item["applicationId"] = str(uuid.uuid4())
            item["createdAt"] = now
            item["lastUpdated"] = now

            table.put_item(Item=item)
            return api_response(item, 201)

        except json.JSONDecodeError:
            return api_response({"message": "Invalid JSON request body"}, 400)
        except ClientError:
            logger.exception("Failed to create application")
            return api_response({"message": "Unable to save the application"}, 500)

    if request.method == "GET":
        try:
            items = []
            scan_arguments = {}

            while True:
                response = table.scan(**scan_arguments)
                items.extend(response.get("Items", []))
                last_key = response.get("LastEvaluatedKey")
                if not last_key:
                    break
                scan_arguments["ExclusiveStartKey"] = last_key

            return api_response(items)

        except ClientError:
            logger.exception("Failed to retrieve applications")
            return api_response({"message": "Unable to retrieve applications"}, 500)

    return api_response({"message": "Unsupported HTTP method"}, 405)

