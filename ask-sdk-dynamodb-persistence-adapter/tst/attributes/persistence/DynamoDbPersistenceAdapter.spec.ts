/*
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

'use strict';

import * as AWS_SDK from 'aws-sdk';
import * as AWS from 'aws-sdk-mock';
import { expect } from 'chai';
import { DynamoDbPersistenceAdapter } from '../../../lib/attributes/persistence/DynamoDbPersistenceAdapter';
import { PartitionKeyGenerators } from '../../../lib/attributes/persistence/PartitionKeyGenerators';
import {JsonProvider} from '../../mocks/JsonProvider';

describe('DynamoDbPersistenceAdapter', () => {
    const tableName = 'mockTableName';
    const defaultPartitionKeyName = 'id';
    const defaultPartitionKey = 'userId';
    const defaultAttributesName = 'attributes';
    const defaultAttributes = {
        defaultKey : 'defaultValue',
    };
    const defaultGetItemOutput = {
        [defaultPartitionKeyName] : defaultPartitionKey,
        [defaultAttributesName] : defaultAttributes,
    };

    const customPartitionKeyName = 'mockId';
    const customPartitionKey = 'deviceId';
    const customAttributesName = 'mockAttributes';
    const customAttributes = {
        customKey : 'customValue',
    };
    const customGetItemOutput = {
        [customPartitionKeyName] : customPartitionKey,
        [customAttributesName] : customAttributes,
    };

    const resourceNotFoundError = new Error('Requested resource not found');
    Object.defineProperty(resourceNotFoundError, 'code', {
        value : 'ResourceNotFoundException',
        writable: false,
    });

    const requestEnvelope = JsonProvider.requestEnvelope();
    requestEnvelope.context.System.device.deviceId = 'deviceId';
    requestEnvelope.context.System.user.userId = 'userId';

    before( (done) => {
        AWS.setSDKInstance(AWS_SDK);
        AWS.mock('DynamoDB.DocumentClient', 'get',  (params, callback) => {
            if (params.TableName !== tableName) {
                // table name not valid
                callback(resourceNotFoundError, null);
            } else {
                if (params.Key[defaultPartitionKeyName] === defaultPartitionKey) {
                    callback(null, {Item: defaultGetItemOutput });
                } else if (params.Key[customPartitionKeyName] === customPartitionKey) {
                    callback(null, {Item: customGetItemOutput });
                } else {
                    // item not found
                    callback(null, {});
                }
            }
        });
        AWS.mock('DynamoDB.DocumentClient', 'put',  (params, callback) => {
            if (params.TableName !== tableName) {
                // table name not valid
                callback(resourceNotFoundError, null);
            } else {
                callback(null, {});
            }
        });
        AWS.mock('DynamoDB', 'createTable', (params, callback) => {
            if (params.TableName !== 'CreateNewTable') {
                callback(new Error('Unable to create table'), null);
            } else {
                callback(null, {});
            }
        });
        done();
    });

    after((done) => {
        AWS.restore();
        done();
    });

    it('should be able to get an item from table', async() => {
        const defaultPersistenceAdapter = new DynamoDbPersistenceAdapter({
            tableName,
        });
        const customPersistenceAdapter = new DynamoDbPersistenceAdapter({
            tableName,
            partitionKeyName : customPartitionKeyName,
            attributesName : customAttributesName,
            dynamoDBClient : new AWS_SDK.DynamoDB(),
            partitionKeyGenerator : PartitionKeyGenerators.deviceId,
        });

        const defaultResult = await defaultPersistenceAdapter.getAttributes(requestEnvelope);
        expect(defaultResult[defaultPartitionKeyName]).equal(undefined);
        expect(defaultResult.defaultKey).equal('defaultValue');

        const customResult = await customPersistenceAdapter.getAttributes(requestEnvelope);
        expect(customResult[customPartitionKeyName]).equal(undefined);
        expect(customResult.customKey).equal('customValue');

    });

    it('should be able to put an item to table', async() => {
        const persistenceAdapter = new DynamoDbPersistenceAdapter({
            tableName,
        });

        await persistenceAdapter.saveAttributes(requestEnvelope, {});
    });

    it('should return an empty object when getting item that does not exist in table', async() => {
        const persistenceAdapter = new DynamoDbPersistenceAdapter({
            tableName,
        });

        const mockRequestEnvelope = JsonProvider.requestEnvelope();
        mockRequestEnvelope.context.System.user.userId = 'NonExistentKey';

        const result = await persistenceAdapter.getAttributes(mockRequestEnvelope);
        expect(result).deep.equal({});
    });

    it('should throw an error when saving and the table does not exist', async() => {
        const persistenceAdapter = new DynamoDbPersistenceAdapter({
            tableName : 'NonExistentTable',
        });

        try {
            await persistenceAdapter.saveAttributes(requestEnvelope, {});
        } catch (err) {
            expect(err.name).equal('AskSdk.DynamoDbPersistenceAdapter Error');
            expect(err.message).equal('Could not save item (userId) to table (NonExistentTable): '
                                      + 'Requested resource not found');

            return;
        }
        throw new Error('should have thrown an error!');
    });

    describe('with AutoCreateTable', () => {
        it('should return an empty object when table successfully created during get', async() => {
            const persistenceAdapter = new DynamoDbPersistenceAdapter({
                tableName : 'CreateNewTable',
                createTable : true,
            });

            const result = await persistenceAdapter.getAttributes(requestEnvelope);
            expect(result).deep.equal({});
        });

        it('should throw an error when create table returns error during get', async() => {
            const persistenceAdapter = new DynamoDbPersistenceAdapter({
                tableName : 'NonExistentTable',
                createTable : true,
            });

            try {
                await persistenceAdapter.getAttributes(requestEnvelope);
            } catch (err) {
                expect(err.name).equal('AskSdk.DynamoDbPersistenceAdapter Error');
                expect(err.message).equal('Could not create table (NonExistentTable): Unable to create table');

                return;
            }
            throw new Error('should have thrown an error!');
        });
    });

    describe('without AutoCreateTable', () => {
        it('should throw an error when reading and the table does not exist', async() => {
            const persistenceAdapter = new DynamoDbPersistenceAdapter({
                tableName : 'NonExistentTable',
                createTable : false,
            });

            try {
                await persistenceAdapter.getAttributes(requestEnvelope);
            } catch (err) {
                expect(err.name).equal('AskSdk.DynamoDbPersistenceAdapter Error');
                expect(err.message).equal('Could not read item (userId) from table (NonExistentTable): ' +
                                          'Requested resource not found');

                return;
            }
            throw new Error('should have thrown an error!');
        });
    });
});