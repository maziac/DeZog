import * as assert from 'assert';
import {suite, test} from 'mocha';
import {Version} from './version';


suite('Version', () => {

    suite('isNewVersion', () => {
        test('bigger/equal/lower', () => {
            // Bigger
            assert.ok(Version.isNewVersion('1.2.0', '1.1.0'));
            assert.ok(Version.isNewVersion('1.2.0', '1.1.9'));
            assert.ok(Version.isNewVersion('1.2.0', '1.1.10'));
            assert.ok(Version.isNewVersion('2.2.0', '1.2.0'));

            // Smaller
            assert.ok(!Version.isNewVersion('1.2.1', '1.2.1'));
            assert.ok(!Version.isNewVersion('1.2.0', '2.2.0'));

            // Equal
            assert.ok(!Version.isNewVersion('1.2.0', '1.2.0'));
            assert.ok(!Version.isNewVersion('0.9.3', '0.9.3'));
            assert.ok(!Version.isNewVersion('4.5.6', '4.5.6'));
        });


        test('undefined/wrong', () => {
            // prev version
            assert.ok(Version.isNewVersion('1.2.0', '0.0.0'));
            assert.ok(Version.isNewVersion('1.2.0', ''));
            assert.ok(Version.isNewVersion('1.2.0', undefined as any));
            assert.ok(Version.isNewVersion('1.2.0', '1.'));

            // current version
            assert.ok(!Version.isNewVersion(undefined as any, '1.2.1'));
            assert.ok(!Version.isNewVersion('1', '2.2.0'));
            assert.ok(!Version.isNewVersion('.', '2.2.0'));
        });

    });

});