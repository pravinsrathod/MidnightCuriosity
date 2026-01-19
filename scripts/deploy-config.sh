#!/bin/bash

# Script to deploy Firebase configuration (rules and indexes) to a specific environment
# Usage: ./scripts/deploy-config.sh [default|production]

ENV=$1

if [[ -z "$ENV" ]]; then
  echo "Usage: ./scripts/deploy-config.sh [default|production]"
  exit 1
fi

if [[ "$ENV" != "default" && "$ENV" != "production" ]]; then
  echo "Invalid environment. Please use 'default' or 'production'."
  exit 1
fi

echo "Deploying Firebase configuration to project: $ENV..."

# Use firebase-tools to deploy
# Note: User must be logged in and have access to the project
firebase deploy --only firestore,storage --project $ENV

echo "Deployment completed for $ENV!"
